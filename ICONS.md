# Every image and icon SlapStat shows

The companion to [`COPY.md`](./COPY.md), for the parts of the interface that are not words.
Seven files we ship, 36 distinct icons drawn inline across 61 places, the pictures fetched
while the app runs, and the images the server draws for a link preview.

It exists so the icon set can be seen as a set. An inline SVG is invisible to a search for
`.svg`, so nothing here shows up in a file listing, and until now the only way to know
whether an idea already had an icon was to remember.

## How to read this

Icons are grouped by what they are for, not by where they live, because most of them live in
several places. Each entry says what the icon draws and lists every place it appears.

- **Sits inside** is the element wrapping the icon. It is usually the button the icon is the
  face of, and its classes say what kind of control that is.
- **Size** is the `width`/`height` on the tag. *From CSS* means the tag sets none and a
  stylesheet decides.
- **Screen readers** is what an assistive reader makes of it. *Decorative* means the icon
  carries `aria-hidden`; *decorative (wrapper)* means something around it does. Every icon in
  the app is one or the other, which is correct: an icon that is the only content of a button
  needs the label on the button, and those are in `COPY.md`.
- **Beside** is the nearest words in the template, as a hint about which instance is which.
  It is scraped, so it is rough.

## What is in here

- [How to read this](#how-to-read-this)
- [What the set is made of](#what-the-set-is-made-of)
- [Files we ship](#files-we-ship)
- [Pictures fetched while the app runs](#pictures-fetched-while-the-app-runs)
- [Images the server draws](#images-the-server-draws)
- [Navigation and menus](#navigation-and-menus)
- [Actions](#actions)
- [Status and state](#status-and-state)
- [Starting points](#starting-points)
- [Brand marks](#brand-marks)
- [Appendix — what listing them turned up](#appendix--what-listing-them-turned-up)

## What the set is made of

Nearly every icon is a **24×24 line drawing**, `fill="none"`, `stroke="currentColor"`, with
rounded caps and joins, in the Feather idiom. Stroke weight is the one thing that moves: 1.6
for the big empty-state drawings, 1.8 for the starting-point cards, 2 for most controls, 2.2
to 3 for the smallest. Colour is always inherited, so an icon takes the colour of the text it
sits with, which is why the same padlock is gold in a badge and grey in a menu.

Four marks break that pattern deliberately, and all four belong to somebody else. Yahoo,
Facebook and Google are drawn inline as their owners draw them, Google in its four colours,
which makes it the only icon on the site that is not monochrome. ESPN is the one brand kept
as a bitmap.

**Nothing is loaded from an icon library.** There is no dependency to update, and no icon
font. Every one of them is markup in the template that uses it.

**Snapshot taken:** 7 September 2026, against `fantasy-web` at `2fb9218`, `fantasy-bff` at
`f5895e9`.

## Files we ship

Everything in `public/`, served from the site root.

| File | Size on disk | Dimensions | Where it is used |
| --- | --- | --- | --- |
| `slapstat-logo.png` | 128 KB | 1446×301 | The wordmark. Header on every signed-in page, the landing page's own header, and the footer. |
| `og-image.png` | 97 KB | 1200×630 | The picture the site itself unfurls as, on Facebook, LinkedIn, Slack and X. Referenced by `index.html`; a shared projection overrides it with one drawn per share. |
| `favicon.ico` | 15 KB | 16, 32 and 48px | The browser tab. |
| `apple-touch-icon.png` | 14 KB | 180×180 | The home-screen icon on iOS. |
| `espn-logo.png` | 1 KB | 128×128 | ESPN's mark, beside the ESPN half of league sync and on the synced-league pill. The only brand we carry as a bitmap. |
| `icon-192.png` | 15 KB | 192×192 | **Nothing references it.** See the appendix. |
| `icon-512.png` | 71 KB | 512×512 | **Nothing references it.** See the appendix. |

## Pictures fetched while the app runs

Not shipped and not drawn: these arrive over the network as the page is used, and each has a
fallback for when it does not.

| What | Where it comes from | Fallback |
| --- | --- | --- |
| Player headshots | Two sources, depending on the player: the BFF at `/api/v1/players/{id}/headshot`, or an absolute ESPN CDN URL the read model already holds | `app-player-headshot` draws the player's initials on a coloured disc |
| The same, on the draft board | As above | `app-player-avatar` draws initials, tinted by the player's primary position |
| Your profile picture | The BFF at `/api/v1/account/avatar`, fetched as a blob because the endpoint needs a bearer token an `<img>` cannot send, then handed to the image as an object URL | The same initials disc, from your username or email |

A picture that fails to load is not left broken: both components listen for the error and
switch to initials.

## Images the server draws

`fantasy-bff` renders one image, per share, so a posted link unfurls as the board rather than
as the site.

| What | Where | Notes |
| --- | --- | --- |
| The share card | `ShareCardRenderer`, served at `/s/{token}/og-image.png` | 1200×630, drawn from the published snapshot: the projection's name, who made it, and the top of their board. Cached for an hour, since crawlers refetch it far more often than it changes. Proxied through the web origin so the tags and the image share a host. The words on it are listed in `COPY.md`, Appendix A. |

## Navigation and menus

Opening things, closing things, and pointing at what comes next.


### Kebab menu

Three dots stacked vertically. `viewBox="0 0 24 24"`. Used 4 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`:67 | button class="th-menu" type="button" | 15x15 | decorative | .scoring |
| `src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`:107 | button class="th-menu" type="button" | 15x15 | decorative | sortIndicator 'summary' summaryLabel == |
| `src/app/draft-start/draft-start.html`:113 | button class="draft-menu" type="button" | 16x16 | decorative | Discarding… if isConfirmingDiscard draft discardPrompt  |
| `src/app/projection-list/projection-card/projection-card.html`:45 | button class="card-menu" type="button" | 16x16 | decorative |  projection .name ”? Yes, delete Cancel Edit draftLabel |

### Close (18px)

A cross, drawn as one path. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/league-sync-dialog/league-sync-dialog.html`:12 | button class="dialog-close" aria-label="Close" type="button" | 18x18 | decorative | Import league settings |
| `src/app/draft-projection/sync-warning-dialog/sync-warning-dialog.html`:22 | button class="dialog-close" aria-label="Undo my change and stay in sync" type="button" | 18x18 | decorative | Changing this setting will take this projection out of  |

### Burger

Three stacked lines. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/app.html`:11 | button class="nav-burger" aria-label="Menu" type="button" | from CSS | decorative | Draft |

### Chevron down

A downward chevron. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/app.html`:31 | button class="nav-trigger" type="button" | from CSS | decorative | Who's hot |

### Chevron right

A chevron pointing right. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:87 | span class="draft-cta-label" | 16x16 | decorative (wrapper) | l draft · timingLabel draft relativeTime draftLabel |

### Close (16px)

A cross, drawn as two paths. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/shared/player-pool-notice/player-pool-notice.html`:33 | button class="pool-notice__dismiss" aria-label="Dismiss" type="button" | 16x16 | decorative | projection from scratch. Worth a look before you draft. |

## Actions

The verbs: buttons and menu items that do something.


### Sync

Two arrows chasing each other round a circle. `viewBox="0 0 24 24"`. Used 4 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/draft-projection.html`:160 | button class="btn btn-primary btn-sm" type="button" | 15x15 | decorative | Import league |
| `src/app/draft-projection/player-projections-table/league-settings-menu/league-settings-menu.html`:9 | button class="menu-item" type="button" | 15x15 | decorative | Re-sync or change league === 'category' League size |
| `src/app/landing/landing-demo/landing-demo.html`:57 | a class="btn btn-secondary btn-sm demo-import" routerLink="/register" | 15x15 | decorative | Import league |
| `src/app/whos-hot/whos-hot.html`:105 | button class="btn btn-primary btn-sm" type="button" | 15x15 | decorative | Import league |

### Share

An arrow leaving an open tray. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/draft-projection.html`:63 | button class="btn btn-secondary" type="button" | 15x15 | decorative | Share draftLinkLabel |
| `src/app/projection-list/projection-card/projection-card.html`:63 | button class="menu-item share" type="button" | 15x15 | decorative | isPreparingShare ? 'Opening…' : 'Share |

### Sliders

Three horizontal sliders at different settings. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/player-projections-table.html`:104 | button class="btn btn-secondary btn-sm league-setup-btn" type="button" | 15x15 | decorative | League setup |
| `src/app/whos-hot/hot-players-table/hot-players-table.html`:31 | button class="btn btn-secondary btn-sm league-setup-btn" type="button" | 15x15 | decorative | League setup |

### Columns

Two tall bars and a short one, for the column picker. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/player-projections-table.html`:124 | button class="btn btn-secondary btn-sm" type="button" | 15x15 | decorative | Stats |
| `src/app/whos-hot/hot-players-table/hot-players-table.html`:49 | button class="btn btn-secondary btn-sm" type="button" | 15x15 | decorative | Stats |

### Arrow up to a line

An arrow pointing up into a ceiling. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`:41 | button class="full-season-pill" type="button" | 13x13 | decorative | el col statLabel && col === 'gp' && !showColumnControls |
| `src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`:199 | button class="menu-item" type="button" | 15x15 | decorative | Set a full 84-game season isDecimalCol |

### Undo circle

An arrow curving anticlockwise back to its start. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:462 | button class="menu-item menu-item--danger discard" type="button" | 15x15 | decorative | Discard draft |
| `src/app/projection-list/projection-card/projection-card.html`:83 | button class="menu-item menu-item--danger discard" type="button" | 15x15 | decorative | Discard draft |

### Pencil (16px)

A pencil at an angle. `viewBox="0 0 16 16"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-mode/draft-picks-panel/draft-picks-panel.html`:29 | button class="feed-change" aria-label="Change pick" type="button" | from CSS | decorative | ? 'You' : |

### Drag handle

Six dots in two columns. `viewBox="0 0 16 16"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-mode/draft-setup/draft-setup.html`:62 | span class="drag-handle" aria-label="Drag to reorder" | from CSS | decorative | Roster slots Cancel |

### Undo

An arrow turning back on itself to the left. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/player-projections-table.html`:20 | button class="btn btn-secondary btn-sm history-btn" aria-label="Undo last change" type="button" | 15x15 | decorative | Player projections |

### Redo

The same arrow mirrored. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/player-projections-table.html`:43 | button class="btn btn-secondary btn-sm history-btn" aria-label="Redo change" type="button" | 15x15 | decorative | Saving… Saved Couldn't save, changes are unsaved |

### Rising bars

Four bars climbing left to right. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`:265 | button class="menu-item" type="button" | 15x15 | decorative | Stats to scale scaledStatSummary col === col |

### Bin (simple)

A bin with a lid, drawn in one path. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`:300 | button class="menu-item menu-item--danger" type="button" | 15x15 | decorative | Remove column |

### Play

A filled right-pointing triangle. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:64 | polyline | 18x18 | decorative (wrapper) | Complete |

### Bin (detailed)

A bin with a separate lid, handle and two vertical strokes. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/projection-list/projection-card/projection-card.html`:101 | button class="menu-item menu-item--danger delete" type="button" | 15x15 | decorative | Delete |

## Status and state

What is true right now, rather than something to press.


### Padlock

A closed padlock. The only icon that means 'you have not paid for this'. `viewBox="0 0 24 24"`. Used 3 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:378 | span class="row-badge premium-badge" | from CSS | decorative | Premium The model's own line for every player. Part of  |
| `src/app/projection-create/projection-create.html`:239 | span class="row-badge premium-badge" | from CSS | decorative | Premium |
| `src/app/whos-hot/game-range-selector/game-range-selector.html`:27 | a class="premium-lock premium-badge" routerLink="/pricing" | 13x13 | decorative | Premium |

### Tick

A bare checkmark, for the chosen row in a menu. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/player-projections-table/columns-menu/columns-menu.html`:35 | span class="add-check" | 12x12 | decorative (wrapper) | statLabel fullNameOf option No stats match your search. |
| `src/app/draft-projection/player-projections-table/position-menu/position-menu.html`:15 | span class="position-check" | 12x12 | decorative (wrapper) | position canResetAll Use default positions |

### Tick in a circle

A filled circle with a checkmark cut out of it. `viewBox="0 0 20 20"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/projection-settings-section/espn-league-sync/espn-league-sync.html`:109 | p class="espn-sync-synced" | from CSS | decorative | Synced from syncedLeagueName ?? id .length Not synced n |
| `src/app/draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync.html`:77 | p class="yahoo-sync-synced" | from CSS | decorative | Synced from · last synced date: 'MMM d, y, h:mm a' .len |

### Info

A lowercase i in a circle. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/shared/help-tip/help-tip.html`:10 | button class="help-trigger" type="button" | 14x14 | decorative | — |
| `src/app/shared/offseason-data-notice/offseason-data-notice.html`:4 | span class="offseason-notice__icon" | 16x16 | decorative | It's the NHL off-season Team affiliations may be out of |

### Tick (18px)

A heavier checkmark than the menu one. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:51 | span class="draft-icon" | 18x18 | decorative (wrapper) | nst. if .length > 0 Your drafts |

### Clipboard

A clipboard with lines on it. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/projection-list/projection-list.html`:21 | div class="state" | from CSS | decorative | No projections yet Create your first projection to star |

### Warning triangle

A triangle with an exclamation mark. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/shared/error-state/error-state.html`:2 | div class="state state--error" | from CSS | decorative | title message Try again |

### Refresh (four arrows)

Two arcs with an arrowhead at each end. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/shared/player-pool-notice/player-pool-notice.html`:4 | span class="pool-notice__icon" | 16x16 | decorative | The player list has been updated added added === 1 ? 'p |

## Starting points

The five things a board can start from. They are a set, drawn to be read side by side on `/draft` and `/projections/new`: three presets, one of your own boards, or a copy of somebody else's.


### Board

A table with a header row and a first column. `viewBox="0 0 24 24"`. Used 3 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:221 | span class="row-icon" | 20x20 | decorative (wrapper) | Updated relativeTime |
| `src/app/draft-start/draft-start.html`:439 | button class="menu-item open-board" type="button" | 15x15 | decorative | Open the projection |
| `src/app/projection-create/projection-create.html`:88 | span class="row-icon" | 20x20 | decorative (wrapper) | Updated relativeTime |

### Chain link

Two links of a chain. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:277 | span class="row-icon" | 20x20 | decorative (wrapper) | sourceLabel board · imported relativeTime |
| `src/app/projection-create/projection-create.html`:134 | span class="row-icon" | 20x20 | decorative (wrapper) | sourceLabel board · imported relativeTime |

### Sparkles

A large four-pointed star with a small one beside it. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:334 | span class="row-icon" | 20x20 | decorative (wrapper) | ft above. Discard that draft to start the preset fresh. |
| `src/app/projection-create/projection-create.html`:181 | span class="row-icon" | 20x20 | decorative (wrapper) | .id sourceLabel board · imported relativeTime |

### Bar chart

Two axes with three bars of rising height. `viewBox="0 0 24 24"`. Used 2 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-start/draft-start.html`:351 | span class="row-icon" | 20x20 | decorative (wrapper) | ft above. Discard that draft to start the preset fresh. |
| `src/app/projection-create/projection-create.html`:213 | span class="row-icon" | 20x20 | decorative (wrapper) | — |

### Pencil (20px)

A pencil over a line, for a board started from nothing. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/projection-create/projection-create.html`:198 | span class="row-icon" | 20x20 | decorative (wrapper) | round" > sourceLabel board · imported relativeTime |

## Brand marks

Not ours. Kept as the owners draw them, which is why they sit outside the house style.


### Yahoo

The Yahoo 'Y!' mark, drawn as a path rather than loaded as an image. `viewBox="0 0 24 24"`. Used 4 times.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/draft-projection/draft-projection.html`:138 | span class="synced-dot" | from CSS | decorative | Synced with leagueName |
| `src/app/draft-projection/projection-settings-section/league-sync/league-sync.html`:13 | button class="provider-tab" type="button" | from CSS | decorative | Yahoo |
| `src/app/draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync.html`:4 | span class="yahoo-sync-brand" | from CSS | decorative | Sync from your Yahoo league Checking… |
| `src/app/whos-hot/whos-hot.html`:83 | span class="synced-dot" | from CSS | decorative | Synced with leagueName |

### Facebook

The Facebook 'f' in its circle. `viewBox="0 0 24 24"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/auth/facebook-sign-in-button/facebook-sign-in-button.html`:3 | button class="fb-sign-in-btn" type="button" | from CSS | decorative | Continue with Facebook |

### Google

Google's four-colour G. The only icon on the site that is not monochrome. `viewBox="0 0 18 18"`. Used 1 time.

| File | Sits inside | Size | Screen readers | Beside |
| --- | --- | --- | --- | --- |
| `src/app/auth/google-sign-in-button/google-sign-in-button.html`:4 | span class="google-btn__icon" | 18x18 | decorative (wrapper) | Continue with Google |

## Appendix — what listing them turned up

Four things, in the order I would deal with them. None is urgent and none is a bug.

### Two icon files nothing points at

`icon-192.png` and `icon-512.png` are the two sizes a web app manifest asks for, and there is
no manifest in the repo. Nothing in the source, the nginx config or the Dockerfile mentions
either file or a `.webmanifest`. They are shipped to every visitor's origin and never
requested: 86 KB of dead weight, and a hint that installing the app to a home screen was
started and not finished. Either add the manifest they were made for, or delete them.

### The same idea drawn twice

Four concepts have two or three drawings each. Nobody would notice them side by side, because
they are never side by side, but they mean the icon set has no single source:

| Concept | Drawings |
| --- | --- |
| A cross | 18px one-path version on dialog close buttons; 16px two-path version on the player-pool notice |
| A bin | one-path version for **Remove column**; three-path version with a separate lid for **Delete** |
| Refresh | the two-arrow **Sync** used for league import; a four-arrow variant on the player-pool notice |
| A tick | a bare checkmark in menus, a heavier one on a finished draft, and a filled circle-check for a synced league |

The tick is arguably three different meanings and fine. The cross and the bin are the same
meaning twice.

### The logo is much larger than any use of it

`slapstat-logo.png` is 1446×301 and 128 KB. The header draws it 30px tall, the footer 24px,
the landing page a little larger. Even at three times the height for a retina screen, it is
being sent at roughly five times the pixels it needs, on every first visit. A resized copy,
or an SVG wordmark, would take most of that 128 KB back. It is the largest asset on the site.

### The icon set is entirely inline, and that is a choice worth keeping

Worth stating because it is invisible: there is no icon library, no icon font, and no sprite
sheet. Every icon is markup where it is used. That costs a little duplication when one is
reused, and buys no dependency, no extra request, and colour that inherits for free. The
duplicates above are the price. A shared component would be the fix if the set grows much
past this, and at 36 it is not there yet.
