---
name: SlapStat
description: Top-shelf tools for fantasy hockey managers
colors:
  rink-navy: "#0f3460"
  rink-navy-hover: "#1a4a80"
  blue-line: "#1c62eb"
  focus-blue: "#1e6bff"
  banner-gold: "#e6b84a"
  banner-gold-deep: "#946307"
  banner-gold-wash: "#fff8e6"
  banner-gold-wash-alt: "#fef0c7"
  banner-gold-wash-hover: "#fde68a"
  banner-gold-ink: "#5a3a00"
  scoreboard-ink: "#1a1a2e"
  bench-grey: "#4c586a"
  boards-grey: "#5f6c85"
  frost: "#c9d6ea"
  ice-grey: "#f0f2f8"
  ice-sheet: "#ffffff"
  ice-mist: "#f4f6fb"
  ice-hover: "#e8edf7"
  tunnel-slate: "#1e293b"
  ice-line: "#e0e4ef"
  ice-line-strong: "#cbd5e1"
  ice-line-header: "#e2e8f0"
  control-edge: "#7b89a0"
  error-red: "#c43a51"
  danger-red: "#b3261e"
  danger-red-hover: "#8f1d17"
  danger-wash: "#fdf0ef"
  warning-wash: "#fff7e0"
  warning-edge: "#f0dfa8"
  warning-ink: "#5c4a12"
  caution-amber: "#b45309"
  success-green: "#117e39"
  success-green-soft: "#4d7c0f"
  success-wash: "#edf7f0"
  success-edge: "#bfe3cb"
  pos-c: "#1d4ed8"
  pos-c-wash: "#eef2ff"
  pos-lw: "#15803d"
  pos-lw-wash: "#ecfdf3"
  pos-rw: "#c2410c"
  pos-rw-wash: "#fff5ed"
  pos-d: "#6d28d9"
  pos-d-wash: "#f3effe"
  pos-g: "#b45309"
  pos-g-wash: "#fdf6ec"
  pos-flex: "#64748b"
  pos-flex-wash: "#f1f5f9"
typography:
  display:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "clamp(2.2rem, 6vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  body-lg:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  control:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
  data:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
components:
  button-primary:
    backgroundColor: "{colors.rink-navy}"
    textColor: "{colors.ice-sheet}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  button-primary-hover:
    backgroundColor: "{colors.rink-navy-hover}"
  button-secondary:
    backgroundColor: "{colors.ice-sheet}"
    textColor: "{colors.rink-navy}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.ice-sheet}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  button-danger-hover:
    backgroundColor: "{colors.danger-red-hover}"
  button-danger-quiet:
    backgroundColor: "{colors.ice-sheet}"
    textColor: "{colors.danger-red}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  button-gold:
    backgroundColor: "{colors.banner-gold}"
    textColor: "{colors.rink-navy}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  segmented:
    backgroundColor: "{colors.ice-mist}"
    rounded: "{rounded.pill}"
    padding: "2px"
  segmented-option-active:
    backgroundColor: "{colors.ice-sheet}"
    textColor: "{colors.rink-navy}"
    rounded: "{rounded.pill}"
    padding: "0.3rem 0.9rem"
  card:
    backgroundColor: "{colors.ice-sheet}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.5rem"
  input-number:
    backgroundColor: "{colors.ice-sheet}"
    textColor: "{colors.scoreboard-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.sm}"
    padding: "0.3rem 0.45rem"
  table-header:
    backgroundColor: "{colors.rink-navy}"
    textColor: "{colors.ice-sheet}"
    typography: "{typography.control}"
  table-header-total:
    backgroundColor: "{colors.banner-gold-deep}"
    textColor: "{colors.ice-sheet}"
  table-cell-total:
    backgroundColor: "{colors.banner-gold-wash}"
    textColor: "{colors.banner-gold-ink}"
  position-chip:
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.1rem 0.35rem"
  premium-badge:
    backgroundColor: "rgba(230, 184, 74, 0.2)"
    textColor: "{colors.banner-gold-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.5rem"
  tooltip:
    backgroundColor: "{colors.tunnel-slate}"
    textColor: "{colors.ice-sheet}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.6rem"
  toast:
    backgroundColor: "{colors.ice-sheet}"
    textColor: "{colors.scoreboard-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
---

# Design System: SlapStat

The visual system as it ships in `src/styles.css` and the component stylesheets. The tokens above
mirror the custom properties on `:root`, which stay the source of truth in code: a value changed
there is changed here in the same PR. Product truth (who it is for, what it may claim) lives in
`PRODUCT.md`; the reasons behind individual choices in `DECISIONS.md`.

## Overview

**Creative North Star: "The Front Office"**

SlapStat looks like the room where a general manager makes the call: a desk of numbers, read
under good light by someone who knows the game. The screen belongs to the data. Navy frames it
(the header band of every table, the one filled button, the titles) and gold marks the figure
that decides (the total a player is ranked by, the Premium edge, the medal on the best pickup).
Everything else stays cool, white and grey so the numbers carry the page.

The mood is **focused, exact and sure of itself**. Confidence comes from figures that line up,
columns that stay put while the page scrolls, and controls that answer at once, not from
decoration. Pages are dense where the job is comparison (tables run the full 1400px and the page
scrolls, not the table) and calm where the job is a decision (forms and lists sit at 1100px).
Interfaces are light only.

What SlapStat is not: **generic SaaS**. No purple gradients, no glassmorphism, no illustrated
blobs, no stock "dashboard" cards repeated for their own sake.

**Key Characteristics:**

- Navy structure, gold value, one blue for links and focus; everything else cool neutral.
- Inter throughout, at a 14px working size, with tabular figures in every column of numbers.
- Wide tables as the signature object: navy header band, frozen rank and name, a gold total
  column pinned to the right on wide screens.
- Flat at rest: white surfaces on a cool grey ground, hairline edges, shadows only on what floats.
- Every colour that carries text is checked against WCAG 4.5:1 on the darkest surface it can
  land on, and the ratio is written beside the token.

## Colors

A cool, low-saturation field of ice greys with two strong voices, rink navy and banner gold, and
a single bright blue reserved for links, the active tab and focus.

### Primary

- **Rink Navy** (`rink-navy`): the structural colour. The table header band, the primary button,
  page and section titles, the final call to action on the landing page, the AI card on Home.
  Darkens to **Rink Navy Hover** (`rink-navy-hover`) under the pointer and on a sorted column.
- **Blue Line** (`blue-line`): links, emphasis drawn in text, the underline under the active nav
  item and the left edge of the active menu item. Darkened from `#1e6bff` to clear 4.5:1 on Ice
  Grey. The brighter **Focus Blue** (`focus-blue`) is the focus ring and the input focus glow,
  where no text sits on it.

### Secondary

- **Banner Gold** (`banner-gold`): the colour of value. The left edge of the total column, the
  sort arrows in the navy header, the gold button on the AI card, the Premium card's top edge,
  the warning-tone fills. Never carries text: white text on it reads 1.9:1.
- **Banner Gold Deep** (`banner-gold-deep`): gold that has to be read. Premium text and badges,
  the total column's heading, the gold year in the landing headline. 5.2:1 either way round.
- **The Gold Washes** (`banner-gold-wash`, `-alt`, `-hover`, with `banner-gold-ink`): the total
  column's cells, zebra-striped and darkening on row hover, so the number a player is ranked by
  reads as its own band down the table.

### Tertiary

- **The Position Colours** (`pos-c`, `pos-lw`, `pos-rw`, `pos-d`, `pos-g`, `pos-flex`, each with a
  `-wash`): blue for centres, green for left wings, orange for right wings, violet for defence,
  amber for goalies, slate for every flex slot (W, F, Util, bench). Set as `--pos` / `--pos-bg` by
  the `.pos--*` classes and read by position chips, avatars and roster slots. A chip always
  carries its letters too; the colour only speeds up the scan.

### Neutral

- **Scoreboard Ink** (`scoreboard-ink`): body text and table figures.
- **Bench Grey** (`bench-grey`): secondary text, descriptions, the inactive segment. 6.4:1 on
  Ice Grey.
- **Boards Grey** (`boards-grey`): the quietest text (meta lines, eyebrows, icons in menus). The
  tightest ratio in the palette at 4.7:1 on Ice Grey, so it is the first to recheck.
- **Frost** (`frost`): secondary text on navy. 8.5:1 there.
- **Ice Grey** (`ice-grey`): the page ground behind everything.
- **Ice Sheet** (`ice-sheet`): cards, panels, table rows, menus, inputs, and text on navy.
- **Ice Mist** (`ice-mist`) and **Ice Hover** (`ice-hover`): the zebra stripe and the
  segmented-control track; the hover wash on rows, menu items and icon buttons.
- **Tunnel Slate** (`tunnel-slate`): the tooltip, the only dark surface besides navy.
- **Ice Line** (`ice-line`, `-strong`, `-header`): card edges, table rules, dividers. 1.2 to 1.5:1:
  they separate, they do not mark a control.
- **Control Edge** (`control-edge`): the border that says "a control is here" (empty fields,
  selects, the active segment, the sideways scrollbar). 3.2:1 or better on every surface, the
  WCAG 1.4.11 floor.

### Status

- **Error Red** (`error-red`) for validation text and invalid edges; **Danger Red**
  (`danger-red`, `-hover`, with `danger-wash`) for destructive buttons and menu items.
- **Warning** (`warning-wash`, `warning-edge`, `warning-ink`): the quiet notice, pale gold with
  brown ink at 8.0:1. **Caution Amber** (`caution-amber`) is the filled chip between fine and bad.
- **Success Green** (`success-green`, `success-green-soft`, with `success-wash` and
  `success-edge`): confirmations, the sync dot, the success toast's edge.

### Named Rules

**The Gold Means Value Rule.** Gold marks what counts: the ranking total, Premium, the AI
projection, the top three picks. It is never decoration, never a background for text, and never
on two competing things in one view.

**The Ratio Beside the Token Rule.** Every colour that carries text is checked against the
darkest surface it can land on, and the ratio is written in the comment beside it in
`styles.css`. Lightening a text colour means rechecking that number first.

**The One Blue Rule.** Blue Line is for links, the active place in navigation and focus. A second
blue for anything else (a chart, a badge, a highlight) blurs what is clickable.

## Typography

**Display Font:** Inter (with Segoe UI, Tahoma, Geneva, Verdana, sans-serif)
**Body Font:** Inter
**Label/Mono Font:** Inter with tabular figures; there is no monospace face.

**Character:** One sans family in four weights (400, 500, 600, 700), tight and plain, so that
hierarchy comes from size and weight and the numbers keep a straight edge.

### Hierarchy

- **Display** (700, `clamp(2.2rem, 6vw, 3.4rem)`, 1.08, -0.02em): the landing headline only, in
  Rink Navy, with one phrase set in italic Banner Gold Deep (the season, "2026-27").
- **Headline** (700, 1.6rem, 1.2): a page's h1 in the app (Streamer Planner, FA Scout, Team Power
  Rankings), in Rink Navy. The editor's projection name runs larger at 2rem.
- **Title** (600, 1.25rem, 1.3): card and section titles, the resumed projection's name. Smaller
  section heads in forms run at 1rem to 1.05rem.
- **Body** (400, 0.875rem, 1.5): the working size. Tables, menus, forms, buttons, descriptions.
  **Body Large** (1rem, 1.6) is for reading copy on the public pages.
- **Data** (400, 0.875rem, tabular figures): every figure in a column, right-aligned.
- **Label** (600, 0.75rem): badges, chips, tooltips, field labels. As an eyebrow it goes uppercase
  with 0.06em tracking, in Boards Grey.

### Named Rules

**The Fourteen-Pixel Rule.** The app works at 14px (0.875rem). 16px is for reading copy on public
pages, 12px for labels and chips. A new screen that sets its body at 16px is the odd one out.

**The Straight Column Rule.** Figures use tabular numerals and right-align, and a column's
heading ends on the same vertical line as its values (`--stat-value-inset`, shared by header,
cell and input). A heading that drifts off its numbers is a bug.

## Layout

Two page widths, set once on `:root` so no page drifts between them: **wide** (1400px) for pages
whose job is a table (the editor, a shared projection, Who's Hot, the in-season tools) and the header that
frames them; **narrow** (1100px) for forms and lists, where more room only strands the fields.

Spacing follows a six-step scale (0.25, 0.5, 0.75, 1, 1.5 and 2rem); 0.5rem and 0.75rem do most of
the work inside components, 1rem and 1.5rem between them.

Tables run down the page rather than inside a viewport-tall scroll box. Their header pins under
the top of the window as the page scrolls past (a scroll-driven animation, with a handler as the
fallback and its own handling on iOS), the rank and name columns are frozen on the left, and from
1024px up the total column is frozen on the right. Columns that do not fit scroll sideways inside
the table; a shadow marks the clipped edge, and a pinned scrollbar stands in at the bottom of the
window while the table's own is below the fold.

Desktop comes first and phones must hold up at 375px. The breakpoint is 640px. Below it the
table's name column narrows to 7rem with the short name ("C. McDavid") and the positions on a
second line, and a toolbar's league settings fold behind one button. The header's nav folds
earlier, at 840px (see Navigation).

## Elevation & Depth

Flat at rest. Depth comes from tone (white Ice Sheet on Ice Grey, a navy band, a gold band) and
from hairline Ice Lines; the shadows are navy-tinted and faint, and only what floats over the page
carries a real one.

### Shadow Vocabulary

- **Resting** (`box-shadow: 0 1px 2px rgba(15, 52, 96, 0.06)`, `--shadow-sm`): panels and the
  active segment. Barely there; the border does the work.
- **Card** (`box-shadow: 0 2px 8px rgba(15, 52, 96, 0.08)`, `--shadow-md`): content cards such as
  the planner's.
- **Floating** (`box-shadow: 0 8px 24px rgba(15, 52, 96, 0.12)`, `--shadow-lg`): menus, popovers,
  tooltips, toasts, dialogs.
- **Frozen edge** (`box-shadow: 6px 0 6px -5px rgba(15, 52, 96, 0.18)`): the edge of a frozen
  column, cast over the columns that scroll under it.

### Named Rules

**The Floating-Only Rule.** A strong shadow means "this is above the page". Cards and panels
stay at Resting or Card; a card that lifts itself to Floating competes with every menu.

## Shapes

Gently rounded and consistent: 6px on controls (buttons, inputs, chips, tooltips, focus rings),
8px on floating panels (menus, popovers, toasts), 12px on cards and page panels, and full pills
for the segmented control, badges and status tags. Avatars and the sync dot are circles. Cards
carry a 1px Ice Line edge; controls a 1px Control Edge. Thicker accent edges are drawn as inset
shadows rather than borders, so they take no room: the Premium card's gold top edge (3px), and the
total column's 3px gold left edge, which also has to ride along when the column sticks.

## Components

Tactile and confident: every control says plainly that it is one, and answers the pointer at
once. Today that answer is a colour or border change in 150 to 200ms; pressed states are rare
(5 `:active` rules in the app), and a clearer press is the direction rather than the current
state.

### Buttons

- **Shape:** gently rounded (6px), 1px border, 0.875rem semibold, icon and label 0.5rem apart.
- **Primary:** Rink Navy fill, white text (0.55rem 1.1rem). One per view: it is the action the
  screen is for.
- **Hover / Focus:** the fill darkens to Rink Navy Hover; focus draws a 2px Focus Blue ring 2px
  outside. Disabled is 60% opacity with a not-allowed cursor.
- **Secondary:** Ice Sheet with Rink Navy text and an Ice Line Strong border that turns navy on
  hover. **Danger** is a red fill, kept for the "yes" of a destructive pair; **Danger Quiet**
  (white, red text and border) is the control that asks. **Gold** (Banner Gold fill, navy text)
  and **On Dark** (transparent, white text, translucent white edge) live on navy surfaces.
- **Sizes:** small (0.35rem 0.85rem), default, large (0.75rem 1.25rem at 1rem), block (full width).

### Segmented control

The Points | Category switch, and the source-kind picker on Draft Mode and New projection. A pill
track in Ice Mist with an Ice Line edge; options in Bench Grey at 500; the chosen one becomes a
white pill with a Control Edge border, navy semibold text and the Resting shadow.

### Chips and badges

- **Position chips:** 0.75rem bold letters on the position's wash, 6px corners, two positions side
  by side.
- **Premium badge:** Banner Gold Deep on a 20% gold tint, pill-shaped, with a small icon; as a link
  it deepens on hover. One class (`.premium-badge`) everywhere Premium is named.
- **Sync dot:** an 8px Success Green circle beside anything a league connection drives. A dot,
  not an icon, because it is a state rather than an action.
- **Status pills:** 0.75rem semibold on Ice Hover, navy text (green when done).

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** Ice Sheet on Ice Grey; the AI card on Home inverts to Rink Navy with Frost text
  and a gold icon tile.
- **Shadow Strategy:** Resting or Card (see Elevation).
- **Border:** 1px Ice Line.
- **Internal Padding:** 1rem by 1.5rem; feature cards 1.5rem all round.
- **Selectable cards** (Draft Mode and New projection sources): a visible radio, an icon tile,
  the name and meta; the checked card takes an outline. Two across on desktop, one on a phone.

### Inputs / Fields

- **Style:** Ice Sheet, 1px Control Edge, 6px corners, 0.875rem; numbers right-aligned in tabular
  figures.
- **Focus:** the border turns Blue Line with a 3px Focus Blue glow at 15%.
- **Error / Disabled:** Error Red edge and message; disabled fields grey out. A setting locked to
  an imported league shows its value read-only with the league's name rather than an empty field.

### Navigation

A white header bar 56px tall with an Ice Line Header rule, the SlapStat wordmark at 30px on the
left. Links are 0.875rem medium in navy at 65% opacity; hover and the active page go full navy
with a 2px Blue Line underline. Premium is the one link in Banner Gold Deep, underlined in gold.
The account sits behind a 32px avatar at the right edge, opening a menu (8px corners, Floating
shadow, active item marked by a 3px Blue Line left edge). Below 840px the links fold behind a
menu button, since the full set needs about 831px; a link added to the header moves that number.
Footer and nav links are title case.

### The Projection Table (signature component)

The object SlapStat is built around, shared in spirit by the editor, a shared projection, Who's
Hot, Draft Mode's lists and the planner. A Rink Navy header band with white semibold headings and
gold sort arrows; a weights row under it on the editor; white and Ice Mist zebra rows at 0.875rem
that wash to Ice Hover on hover; rank and name frozen on the left with the frozen-edge shadow;
positions as chips beside the name and the club as a small grey code; figures right-aligned in
tabular numerals; and the total in its own gold band at the right edge, its heading in Banner
Gold Deep. An edited row is outlined in 2px navy. Missing values are a dash, never a zero.

### Tooltips, toasts and notices

- **Tooltip:** Tunnel Slate, white 0.75rem medium text, 15rem wide at most, fading up 2px in
  150ms. Always the app's own `appTooltip`, never the browser's `title`.
- **Toast:** bottom centre, white with a 4px left edge (Danger Red for a failure, Success Green
  for a confirmation), Floating shadow, 8px corners.
- **Notice:** one component in three tones (info, warning, error) and two shapes (boxed, inline);
  shipped behind a flag while the older one-off notices remain.

### Icons

Lucide only, through `<app-icon>`: a 24 grid, no fill, `currentColor`, stroke 2, round caps and
joins. Sizes are a scale, not a choice: 14 inline with text, 16 on buttons and in menus, 20
standalone, 48 for empty and error states. Brand marks (Yahoo, Google, Facebook, ESPN) stay
multi-coloured logos.

## Do's and Don'ts

### Do:

- **Do** use the `:root` custom properties for every colour, space, radius and shadow; a hex in a
  component stylesheet is a leftover, not a precedent.
- **Do** keep one filled Rink Navy button per view; everything else is secondary, quiet or a link.
- **Do** spend gold only on value: the ranking total, Premium, the AI projection, the best picks.
- **Do** set every column of numbers in tabular figures, right-aligned, with the heading ending on
  the values' line.
- **Do** give every control a visible answer to hover and focus (the 2px Focus Blue ring, 2px
  out), and give new controls a pressed state too.
- **Do** check a new text colour against the darkest surface it can land on and write the ratio
  beside the token.
- **Do** check every screen at 375px; the breakpoint is 640px.

### Don't:

- **Don't** use purple gradients, glassmorphism, illustrated blobs or other generic SaaS dressing.
- **Don't** put a strong shadow on anything that does not float over the page.
- **Don't** draw an icon by hand, type a character where an icon belongs, or add a second icon
  set.
- **Don't** use the browser's native `title` tooltip.
- **Don't** introduce a second blue for anything but links, the active place and focus.
- **Don't** set app body text at 16px or headings in a second typeface.
- **Don't** let a value the app does not know render as a zero or a default; a dash or no marker
  says "unknown".
