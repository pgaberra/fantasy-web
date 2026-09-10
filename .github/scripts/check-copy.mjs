#!/usr/bin/env node
/**
 * Holds the app's copy to the settled part of its writing standard: COPY-RULES.md.
 *
 * The rules that need a machine are not the ones banning a word. Those hold by themselves,
 * because "supercharge" is conspicuous the moment you type it: the whole marketing-vocabulary
 * list came to two hits across 68 templates. The ones that need a machine are the pick-one-name
 * rules, where both options read fine: nothing feels wrong while writing the wrong one, so nothing
 * sends anyone to look the rule up, and no reviewer diffs vocabulary across 68 files. A script
 * settles it in a millisecond.
 *
 * Scope is deliberately narrow: templates only, visible text plus the attributes that carry copy.
 * A `.ts` string literal sits next to identifiers, css classes and urls that trip every word
 * rule, and a check that cries wolf gets skipped rather than fixed.
 *
 * Ratcheted against .github/copy-baseline.json, so it blocks new violations without demanding
 * the back catalogue be fixed first. `--update` rewrites the baseline.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const RULES = join(ROOT, 'COPY-RULES.md');
const BASELINE = join(ROOT, '.github', 'copy-baseline.json');
const SCAN = join(ROOT, 'src', 'app');
const update = process.argv.includes('--update');

/** The rows of the markdown table under a `## heading`, minus its header and divider row. */
function table(markdown, heading) {
  const section = markdown.split(/^## /m).find((s) => s.startsWith(heading));
  if (!section) throw new Error(`COPY-RULES.md has no "## ${heading}" section`);
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .slice(2)
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
}

const markdown = readFileSync(RULES, 'utf8');

/** Every phrase the check looks for, what to write instead, and why. */
const rules = [
  ...table(markdown, 'Terminology').flatMap(([concept, use, never]) =>
    never
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean)
      .map((term) => ({ term, instead: use, why: concept.toLowerCase() })),
  ),
  ...table(markdown, 'Phrases to avoid').map(([term, instead]) => ({
    term,
    instead,
    why: 'on the avoid list',
  })),
  // Casing IS the rule in this table, so these alone match case-sensitively. A case-insensitive
  // "Slapstat" rule matches the correct "SlapStat" and reports all 40 of them as violations.
  ...table(markdown, 'Spelling and casing').map(([term, instead]) => ({
    term,
    instead,
    why: 'spelled or cased wrong',
    exact: true,
  })),
  // A cell names its mark and gives the character in parentheses: "em dash (—)". The character is
  // what gets matched, and anywhere, not as a whole word: "season—every" has letters on both sides
  // and a word-boundary match would never see it.
  ...table(markdown, 'Punctuation').map(([cell, instead]) => ({
    term: cell.match(/\(([^)]+)\)/)?.[1] ?? cell,
    label: cell,
    instead,
    why: 'punctuation',
    anywhere: true,
  })),
];

function templates(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return templates(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

/** What a reader actually sees: the text between the tags, plus the attributes carrying copy. */
function copyIn(html) {
  const visible = html
    .replace(/<svg\b[\s\S]*?<\/svg>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');
  const attrs = [...html.matchAll(/(?:appTooltip|aria-label|placeholder|title|alt)="([^"]*)"/g)]
    .map((match) => match[1])
    .join(' ');
  // The entity renders as the character, so it is the character as far as a reader is concerned.
  return `${visible} ${attrs}`.replace(/&mdash;/g, '—');
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

const found = {};
for (const path of templates(SCAN)) {
  const file = relative(ROOT, path).split(sep).join('/');
  const haystack = copyIn(readFileSync(path, 'utf8'));
  for (const { term, exact, anywhere } of rules) {
    const escaped = term.replace(ESCAPE, String.raw`\$&`);
    // Whole phrases only, so "starts" never fires inside "restarts". Punctuation is the exception.
    const source = anywhere ? escaped : String.raw`(?<![\w-])` + escaped + String.raw`(?![\w-])`;
    const pattern = new RegExp(source, exact || anywhere ? 'g' : 'gi');
    const count = (haystack.match(pattern) ?? []).length;
    if (count) found[`${file} :: ${term}`] = count;
  }
}

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify(found, Object.keys(found).sort(), 2)}\n`);
  console.log(`Baseline rewritten: ${Object.keys(found).length} entries.`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error(`::error::${BASELINE} is missing. Create it with: npm run check:copy -- --update`);
  process.exit(1);
}

const added = Object.entries(found).filter(([key, n]) => n > (baseline[key] ?? 0));
const fixed = Object.entries(baseline).filter(([key, n]) => (found[key] ?? 0) < n);

if (added.length) {
  console.error(`::error::${added.length} new copy-rule violation(s):`);
  for (const [key, n] of added) {
    const [file, term] = key.split(' :: ');
    const rule = rules.find((r) => r.term === term);
    const allowed = baseline[key] ?? 0;
    console.error(`  ${file}`);
    console.error(
      `    "${rule.label ?? term}" x${n}${allowed ? ` (baseline allows ${allowed})` : ''}` +
        ` - ${rule.why}: write "${rule.instead}"`,
    );
  }
  console.error('Rules: COPY-RULES.md. Judgement rather than rules: the slapstat-copy skill.');
  process.exit(1);
}

if (fixed.length) {
  console.log(`${fixed.length} baselined violation(s) are gone. Tighten it:`);
  console.log('  npm run check:copy -- --update   (commit the smaller baseline in the same PR)');
}
console.log(`Copy rules: ${rules.length} checked across the templates, no new violations.`);
