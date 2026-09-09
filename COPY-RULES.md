# Copy rules

The machine-checkable part of SlapStat's writing standard. `npm run check:copy` reads the
tables below and fails a PR that adds a violation.

**This file is not the writing guide.** Tone, rhythm, whether a sentence should exist at all:
none of that is decidable by a script, and trying to encode it here would only produce rules
that are wrong half the time. That work belongs to the `slapstat-copy` skill, which holds the
before/after patterns and the voice. This file holds the subset a machine can settle.

## Why the split

Measured against the shipping app, the two kinds of rule behave completely differently.

Rules of the form **"never write X"** hold on their own: the whole marketing-vocabulary list
came to two hits in 68 templates. The word is conspicuous the moment you type it, so you stop.

Rules of the form **"when you mean C, write X and not Y"** do not hold at all. `player
rankings`, the canonical name of the central thing this product makes, appeared **zero** times,
while `player list` and `the board` were in use. Nothing goes wrong when you write `player
list`: it reads perfectly well, so there is no moment of doubt that sends anyone to look the
rule up. That is precisely the class a script settles in a millisecond, which is why this file
exists at all.

## Terminology

One word per concept. A synonym invented in one string makes the reader stop and work out
whether it is the same thing.

| Mean this | Write this | Never these |
|---|---|---|
| The saved artifact a manager creates | projection | ranking model, projection board |
| The ranked output of a projection | player rankings | player list, the sheet |
| The league's categories or point values | scoring settings | scoring system, scoring format |
| Everything else configured about the league | league settings | league config, league setup |
| The live drafting feature | Draft mode | draft board mode, live draft |
| Games a goalie started | games started | games-started count |
| The paid membership | Premium | premium tier, premium plan, Pro plan |
| The free product | the free app | free tier, basic version |

`the board` is deliberately absent: *draft board* is a real object inside Draft mode and
"Get your draft board ready" is good copy. Using *board* for the rankings on a page that has
nothing to do with drafting is the thing to avoid, and no script can tell those apart.

## Spelling and casing

Matched **case-sensitively**, because here the casing is the whole rule. Everything in the
other two tables is matched case-insensitively.

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
| leverage | use |
| in order to | to |
| Something went wrong | name what failed |
| Please try again | only when retrying could succeed |

*Unlock* is deliberately not on this list: it is what the Premium buttons say, and it names
the thing literally rather than dressing it up.

## What the check does not read

The check scans Angular templates (`src/app/**/*.html`): visible text plus the attributes that
carry copy (`appTooltip`, `aria-label`, `placeholder`, `title`, `alt`). Copy that lives in a
`.ts` file, feature lists and validation messages among it, is **not** scanned: string literals
there sit next to identifiers, css classes and urls that trip every word rule, and a check that
cries wolf gets skipped rather than fixed. Reviewing those is the skill's job.

## Baseline

`.github/copy-baseline.json` records the violations already shipping, so this check blocks new
ones without demanding the back catalogue be fixed first. A count may only go down. Regenerate
after fixing copy with `npm run check:copy -- --update`, and commit the smaller baseline in the
same PR.
