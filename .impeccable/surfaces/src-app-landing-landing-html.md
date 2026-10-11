---
version: 1
slug: "src-app-landing-landing-html"
primary_target: "src/app/landing/landing.html"
related_targets: ["src/app/landing/landing-lineup/landing-lineup.html"]
---

# Surface brief: the signed-out landing page (`/`)

Scope: the public landing page, `src/app/landing/`. Mode: Persuade.

Audience: a fantasy hockey manager who already plays (Yahoo or ESPN, points or categories), landing
here signed out, any time of year. Job: decide in seconds whether SlapStat ranks players the way
their league scores them, then create a free account. Proof on hand: the real projection editor
over the live player pool (no account needed), and the lineup card filled from the same ranking.
Constraints: season-independent copy (no season, no "the season is on"), no invented claims
(no counts, testimonials, accuracy claims), every tool sold only where the build serves it
(Who's Hot by build flag, the AI projection by the BFF's features), prerendered and readable
without JavaScript, 375px must hold.

Unresolved: whether the lineup card's weight set (G, A, PPP, SOG, HIT, BLK, W, SV) is the right
eight; whether the demonstration panels for the three in-season tools should one day read the
real pages' data.

## Direction contract

THESIS: The first viewport proves the one mechanism SlapStat owns: every number is scored by
your league's scoring settings, and the answer changes in place. It refuses the headline-over-
subcopy-over-a-row-of-cards page and the headline that names a season.

OWN-WORLD: SlapStat's Front Office, unchanged: Ice Grey ground, white sheets with hairline Ice
Line edges, Rink Navy structure (the table header band, the one filled button, the titles),
Banner Gold only on the value that decides (the lineup's total column, Premium), Inter with
tabular figures, position chips in the pos-* colours, the projection table's own grammar. No
gradients, no glass, no illustration.

STORY: The visitor reads "Your league's scoring. Your best lineup." beside a lineup card already
filled from the live pool. They nudge a weight or flip Points to Category and watch slots change
and hold a highlight. They believe the ranking is theirs. They scroll: the full editor, then the
Streamer Planner, Who's Hot and Team Power Rankings as working panels, then the draft tools,
Premium where it is served, and the close. They create a free account.

FIRST VIEWPORT: 60px white nav (wordmark, Premium, Sign In, Get Started). Below it a two-column
hero on the Ice Grey ground: left 42%, the headline at clamp(2.3rem, 4.6vw, 3.4rem) in Rink
Navy, a 1.1rem lede, the primary "Get started, it's free" and the secondary "Rank every player"
(an in-page link to the editor). Right 58%, the lineup card: a white sheet, a title bar with
"Best lineup by your scoring" and the Points | Category segmented control, a weights row of
eight labelled number inputs, seven slot rows (C, C, LW, RW, D, D, G) each with the position
chip, the player's name and club, GP and the gold total column, and a foot line saying the
numbers come from the real player pool. Under the hero a jump strip naming the four tools.

FORM: The Lineup Card, index 7 of my ordered list (ranked last for its risk, dealt lead), seed
key c4e14789. Raised by the gate-board challenger (declined): a slot whose player changes moves
in place and holds a gold highlight until the eye has caught it; rows never blink out and back.
Signature interaction: edit a weight, the lineup refills. Motion grammar: the one authored
moment is that highlight hold (and a quiet rise of the card on first paint); nothing else moves.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance
