// Gives a client-rendered page a link preview of its own: Discord, Slack, iMessage and friends
// read a shared URL's HTML without running the app, and every client-rendered address is served
// the same shell, index.csr.html, whose Open Graph tags describe the home page. For each page in
// src/link-previews.json this writes a copy of that shell to <path>/index.html with the page's own
// tags, which nginx serves for the address before falling back to the shell (nginx.conf,
// `try_files $uri $uri/index.html /index.csr.html`). A browser gets the same app either way.
//
// Only the og: and twitter: tags change. <title> and the description stay the home page's: the app
// reads them on start-up as the defaults for pages that set none (shared/crawl-tags.ts), so a page
// opened here and then left would otherwise lend its name to every page after it.
//
// Run after `ng build` (the build script does). It fails rather than write a page whose tags it
// could not all set, which would unfurl as the home page with nothing to show for it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/fantasy-web/browser');
const shell = readFileSync(join(out, 'index.csr.html'), 'utf8');
const pages = JSON.parse(readFileSync(join(root, 'src/link-previews.json'), 'utf8'));
const SITE_ORIGIN = 'https://slapstat.com';

const escape = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

for (const page of pages) {
  if (existsSync(join(out, page.path, 'index.html'))) {
    throw new Error(
      `${page.path}/index.html already exists: the page is prerendered, so it has its own tags.`,
    );
  }
  if (!existsSync(join(root, 'public', page.image))) {
    throw new Error(`${page.path}: its image public/${page.image} does not exist.`);
  }
  const image = `${SITE_ORIGIN}/${page.image}`;
  const tags = {
    'property="og:title"': page.title,
    'name="twitter:title"': page.title,
    'property="og:description"': page.description,
    'name="twitter:description"': page.description,
    'property="og:image"': image,
    'name="twitter:image"': image,
    'property="og:image:alt"': page.imageAlt,
  };
  let html = shell;
  for (const [attribute, value] of Object.entries(tags)) {
    const tag = new RegExp(String.raw`(<meta\s+${attribute}\s+content=")[^"]*(")`);
    if (!tag.test(html)) {
      throw new Error(`index.csr.html has no <meta ${attribute}> to set for ${page.path}.`);
    }
    html = html.replace(tag, (_, start, end) => start + escape(value) + end);
  }
  mkdirSync(join(out, page.path), { recursive: true });
  writeFileSync(join(out, page.path, 'index.html'), html);
  console.log(`Link preview written: /${page.path}`);
}
