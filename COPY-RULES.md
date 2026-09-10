# Copy rules

This file contains machine-checkable copy rules. Editorial judgment belongs in the
`slapstat-copy` skill.

## Terminology

Use one canonical term for each product concept. Do not introduce synonyms for the same concept
unless they refer to something genuinely different.

| Mean this | Write this | Never these |
|---|---|---|
| The saved artifact a manager creates | projection | ranking model, projection board |
| The ranked output of a projection | player rankings | the sheet |
| The league's categories or point values | scoring settings | scoring system, scoring format |
| Everything else configured about the league | league settings | league config |
| The live drafting feature | Draft mode | draft board mode, live draft |
| Games a goalie started | games started | games-started count |
| The paid membership | Premium | premium tier, premium plan, Pro plan |

## Spelling and casing

Matched **case-sensitively**, because here the casing is the whole rule. Everything else is
matched case-insensitively.

| Never this | Write instead |
|---|---|
| Slapstat | SlapStat |
| SlapStats | SlapStat |
| SLAPSTAT | SlapStat |
| Yahoo! | Yahoo |
| ESPN+ | ESPN |

## Phrases to avoid

| Never this | Write instead |
|---|---|
| ultimate | (cut it) |
| revolutionary | (cut it) |
| game-changer | (cut it) |
| next-level | (cut it) |
| unleash | (cut it) |
| elevate | (cut it) |
| supercharge | (cut it) |
| empower | (cut it) |
| effortless | (cut it) |
| seamless | (cut it) |
| seamlessly | (cut it) |
| powerful insights | say which insight |
| built for winners | (cut it) |
| take your league to the next level | (cut it) |
| say goodbye to | (cut it) |
| we've got you covered | (cut it) |
| let's dive in | (cut it) |
| it's worth noting that | (cut it) |
| in today's fast-paced world | (cut it) |
| designed to help you | say what it does |
| the truth is | (cut it) |
| here's the thing | (cut it) |
| what this means is | (cut it) |
| used to be guesswork | (cut it) |
| utilize | use |
| Something went wrong | name what failed |

*Unlock* is deliberately not on this list: it is what the Premium buttons say, and it names
the thing literally rather than dressing it up.

## Punctuation

| Never | Use instead |
| --- | --- |
| em dash (—) | comma, colon, parentheses, or a new sentence |

## Scope

The check scans Angular templates (`src/app/**/*.html`) only. TypeScript strings are reviewed by
the `slapstat-copy` skill.

## Baseline

`.github/copy-baseline.json` records the violations already shipping, so this check blocks new
ones without demanding the back catalogue be fixed first. A count may only go down. Regenerate
after fixing copy with `npm run check:copy -- --update`, and commit the smaller baseline in the
same PR.
