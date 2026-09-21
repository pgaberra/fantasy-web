# CLAUDE.md — fantasy-web

Angular frontend for the fantasy hockey draft tool. Fantasy managers log in,
make predictions for the upcoming NHL season, and get a ranking of players
based on their league/scoring settings. Talks only to `fantasy-bff`.

`AGENT-NOTES.md` holds the design history and incidents behind these rules —
read it when something here seems odd, not by default.

## Tech stack

- Angular, TypeScript, RxJS: the versions are whatever `package.json` pins
- Standalone components, signals
- Tests: Vitest (via `ng test`), ng-mocks, jsdom
- Lint: ESLint + angular-eslint; Format: Prettier
- API client generated from BFF OpenAPI via `ng-openapi-gen`

## Common commands

```bash
npm ci                 # install (use this, not npm install, for clean state)
npm start              # ng serve → http://localhost:4200 (talks to a local BFF on :8080)
npm run start:staging  # ng serve locally but point apiUrl at the staging BFF (api.staging.slapstat.com)
npm test               # Vitest run
npm run lint           # eslint src/**/*.ts
npm run format         # prettier --write
npm run format:check   # prettier --check (CI uses this — must pass)
npm run build          # production build → dist/fantasy-web/browser
npm run generate:api   # generate src/app/api from specs/bff-openapi.yaml
npm run check:copy     # hold user-facing copy to COPY-RULES.md (CI uses this)
```

CI runs (and must pass): `generate:api`, `lint`, `format:check`, `check:copy`, `test`,
`build`, and the guard scripts in `.github/scripts/` (`check-build-placeholders.sh`,
`check-deployment-args.sh`, `check-inline-icons.sh`, `check-pending-states.sh`).

> **After cloning, run `npm run generate:api` once** — `src/app/api` is generated,
> not committed, so lint/test/build will fail until it exists.

## Architecture (`src/app/`)

- `api/` — **generated** client (`fn/`, `models/`), **not committed** (gitignored).
  Generated from the pinned `specs/bff-openapi.yaml` via `npm run generate:api`
  (CI runs this after `npm ci`). Do not hand-edit.
- `auth/` — `login`, `register`, shared `auth-form`
- `draft-projection/` — the main feature: `projection-settings-section`,
  `scoring-type-section`, `scoring-stats-section`, `player-projections-table`,
  `share-dialog` (publishing a projection as a public link).
  - The table's toolbar is two groups: the **league settings** (Points/Category,
    League setup, Stats, Ranking, Import league — they change the numbers) and the
    **filters** (search, position, team, rookies — they change which rows show). On a
    phone the first group folds behind one "League settings" button; the bulk
    **Decimals** setting sits folded under the Stats menu; filter selects carry no
    visible label — their first option already says what they narrow.
  - The player pool moves under a saved projection (new season, trades, call-ups), and
    the **BFF** adds the newcomers on the read that notices, seeded from what the
    projection started as. It never removes: a row whose player has left the pool is
    kept and **the table is what hides it**, without a word. `shared/player-pool-notice`
    reports the additions from `poolReconciliation`, once per pool change. The editor
    carries `playerBasis` / `playerPoolSyncedAt` through `ProjectionState` untouched, so
    a save doesn't drop them.
  - Behind `MANUAL_RANKING_ENABLED`, the toolbar's **Ranking** menu switches a player
    type from its projected stats to the owner's own order. `models/manual-ranking.ts`
    holds the whole of it: the hand-ranked type keeps the value curve its projections
    produced and the order only decides who sits in which seat, so the board can still
    weigh a hand-ranked goalie against a centre. It is applied in `scoredProjections`,
    upstream of every rank, share and draft board — never in a sort. The # column is an
    input only while `rankableType()` says the rows on screen are that whole type in
    ranking order.
  - **Rookies**: a badge by the name plus a "Rookies only" filter, from
    `GET /api/v1/players/rookies`. The endpoint answering `known: false` (projection
    service not running) and a failed request both read as **no marker and no filter**,
    never as every player being a veteran. `rookieIds` is null in both cases, and is
    read via `hasValue()` because reading a resource in an error state throws.
- `draft-start/` — the **Draft Mode** page (`/draft`): picks what a draft is drafted
  against — presets, the user's own projections, and boards copied from a share link.
  - Drafts left mid-way lead the page as cards (resuming one is what most visits are
    for); **the card itself is the button** ("Resume draft" / "View summary" at its
    edge), with discard and open-the-projection behind a kebab.
  - Starting a draft is **one choice made in steps**: a segmented control for the kind
    of source (each segment carries its count, so the two kinds not open are still
    accounted for), the radio cards of the open kind, and a single filled **Start
    draft** button — the only filled button on the page. Every choice under the tiles
    is **the same card** (visible radio, icon, name, meta, outline on the checked one),
    two across on desktop, one on a phone. The two presets side by side are peers.
  - `projection-create` asks the same question the same way, down to the markup: same
    segmented control, same radio cards, same paste field on the shared kind. The three
    kinds and their labels live in `models/source-kind.ts` so the two pages cannot drift
    into calling one group two things; everything else is per page (scoped styles).
  - Both pages set the **league** above the preview with the one
    `shared/league-settings-controls` component and the preview's editable weight row.
    Each page keeps the changed league per starting point: the draft picker hands it to
    the draft in history state; the new-projection page lays it over the settings it
    creates with (a copy stays byte-exact when the league was left alone).
  - The first row of the open kind is checked from the start (`selection`, a
    `linkedSignal` that keeps a pick whose row survives a reload).
  - The AI projection preset carries a gold **Premium** badge only where
    `paymentsEnabled` is on (without payments it is free and ungated, and a badge naming
    a subscription the build cannot sell promises something nobody can act on). It is
    **also locked, and the two are different questions**: the badge says which plan it
    belongs to, the padlock says this account has not bought it.
    `shared/premium/ai-projection-access.ts` answers the second for both pages — and
    holds off until the entitlement has landed (locking on a live read would padlock a
    subscriber's own feature on every open). **Locked is not hidden, deliberately**: the
    card keeps its place, icon and full-weight name; only a gold edge and the padlock say
    it is not yours, and picking it swaps the page's primary button for the way to
    `/premium`. (`FeatureService.aiProjection` is what genuinely hides it — the BFF's
    answer from `GET /api/v1/features`, so there is no web build switch for it.) The
    radio stays real and visible on purpose: the E2E suite checks it (`li.row` +
    `getByRole('radio')`).
  - The shared kind carries the paste field: `shareTokenFrom` accepts a whole URL, a
    `/s/…` path, or a bare token; a name clash (409) asks for a name rather than
    reporting a failure the user cannot act on (rare now — db-service numbers a taken
    name).
  - Beside the paste field sits **Import a spreadsheet** (`shared/spreadsheet-import`,
    on the home page's import panel too): an .xlsx or .csv read in the browser becomes
    an imported board like a share link's — `kind: imported`, its own rows (every pool
    player, empty unless the sheet names him; a named player's own line under the
    sheet's stats) and no origin, which is how the lists tell it apart ("From a
    spreadsheet", a green sheet icon). Nothing draws unless `SPREADSHEET_IMPORT_ENABLED`
    is on. An import switches to that kind and checks the copy.
  - **A draft is a row of its own** (`kind: draft`), holding its picks, its league and a
    copy of the numbers it was played against — so a board can be drafted against **as
    many times as its owner likes**, and editing or deleting that board leaves a draft
    under way exactly as it was. Start never saves anything: it opens
    `/draft/new/preset/:preset` or `/draft/new/board/:id`, and the draft page creates the
    draft once its setup is confirmed (`POST /api/v1/projections/{id}/drafts` for a
    board, which copies the rows server-side; a plain create with `kind: draft` and
    `source` for a preset, whose rows the server seeds). The draft then lives at
    `/drafts/:id`.
  - `ProjectionStorageService.listProjections()` filters the drafts out (they never
    show up as the user's own work); `listAll()` is the one place they are wanted (the
    draft page lists them above the boards a new draft would start against);
    `listEditable()` (the user's own plus imported boards, drafts excluded) is what
    `projection-list` lists.
  - **A draft is named**, defaulting to what it was started from and numbered by the
    server on a clash. It can be renamed from its row on the draft page or the board
    heading (`PUT /api/v1/projections/{id}/name`); a name the user typed is refused when
    taken, and from then on it is theirs. The heading is editable during the setup too,
    before anything is saved (`freeNameFrom` in `services/projection-name.ts`, the same
    shape db-service uses) — otherwise the setup reads "AI Projection" and the draft that
    comes out is "AI Projection (2)". The server still settles the real name. A **league
    sync** names the draft after the league (`derived: true`), numbered on a clash and
    declined once the user has named the draft themselves. A sync during an unsaved setup
    is held and applied the moment the draft exists. `projection-create` deliberately
    keeps `listProjections()`: an imported copy is not a projection of the user's own. An
    imported card says whose board it is and offers no Share, since a share credits the
    account that publishes it.
  - Both sources run the same board in `draft-mode/`.
  - A draft whose league came from Yahoo can **follow that league's live draft**, offered
    only where `FeatureService.leagueDraftSync` (the BFF's `GET /api/v1/features`) says
    so. Following makes the league the source of the board: its teams, keyed by Yahoo's
    team key, in draft order, and its picks, polled every 5 s while the tab is visible
    (`league-draft-follow.ts` holds the pure mapping). Every pick edit is locked meanwhile;
    a board with picks entered by hand asks before it is replaced; following stops on an
    auction draft, a league without the user's team, a finished draft, or a 404/424. A
    dropped connection keeps polling.
- `shared-projection/` — the page behind a share link (`/s/:token`), **public and
  unguarded**: a share link has to open for someone who has never signed in.
  - The byline carries the author's profile picture, or the initial of their username
    where they have none. A signed-in visitor is offered "Draft Mode", which copies the
    snapshot into their own projections and opens the board; a signed-out one gets the
    sign-up. Pressing either button again makes **another** copy — db-service numbers the
    new one rather than refusing.
  - It renders the **snapshot** the owner published — the top rows with identity, rank
    and value frozen into them — so it needs no player read model and no ranking of its
    own. It renders the editor's own `player-row` and `projections-table-header` in a
    **read-only** mode, so a shared projection looks like the table it was published
    from — but it does **not** reuse the scoring: those values were computed against the
    owner's whole player pool, and recomputing them over the hundred published rows would
    quietly print different numbers than were shared. Sharing is the marketing loop, so
    both ends are measured (`projection_shared`, `shared_projection_viewed`).
  - Crawlers never reach this component: `nginx.conf` routes link-preview user agents for
    `/s/*` to the BFF's per-share Open Graph document (the BFF origin is substituted into
    `nginx.conf` at image build time from the same `API_URL` build arg as the bundle). The
    preview's image is the BFF's per-share card, proxied through this origin at
    `/s/:token/og-image.png` so the tags and the image they point at share a host. That
    location must stay **above** the static-asset location, which would otherwise claim
    any URL ending in `.png` and 404 it.
- `admin/premium/` — the Premium section of `/admin`: everyone who has Premium, and a
  form that gives an account a number of months of it for nothing. A given membership is
  stored apart from any subscription, so ending one here never touches what a paying
  member is billed, and only a given one offers the End button. Card styles are repeated
  in its own CSS because `admin.css` is scoped to the parent component.
- `admin/` — admin-only tools (`/admin`): the Yahoo service account, the player sync,
  and a **Yahoo access probe** — one question to Yahoo (will it serve this game's
  players?) for a game key and season you type in, showing the status and Yahoo's own
  error wording. A refusal is a **result, not an error**: only a failure of our own call
  surfaces as an error, never Yahoo's own 403.
- `home/` — where a signed-in user starts (`/home`; signing in and a signed-in visit to
  `/` land here): the features side by side, each with its own way in (Projections,
  Draft mode, the AI projection, Who's Hot, a share-link import under them); a returning
  user also gets the projection they updated last across the top. The AI card is drawn
  wherever the BFF serves the model; its Create button opens
  `/projections/new?start=model` and its Draft link `/draft?start=model`, and both pages
  pick the AI preset once the BFF has said it serves it. `demoRedemptionGuard` sends
  anyone with landing-demo work waiting on to `/projections`, which is what saves it.
- `profile/` — the account's **profile picture** and **public name** (`/profile`,
  signed-in), reached from the header avatar's account menu. Sharing forces the choice of
  a name, but it stays changeable: a shared page credits the current one. `AccountService`
  caches the name in a signal (the share dialog and this page both need to know without
  re-fetching) and **follows the session**: an `effect` on `AuthService.isLoggedIn` loads
  the profile and picture when a session starts and drops them when it ends. The picture
  is held as an object URL (`avatarUrl` — the endpoint needs the bearer token an `<img>`
  cannot send). `AvatarImageService` crops and scales the picked file to a 256px square
  JPEG **in the browser** before upload, so the server never decodes an untrusted image.
  Both header and profile page draw it with the table's `app-player-headshot` (initials
  fallback); a shared board's byline draws the **author's** picture from the public
  `authorAvatar` address — nothing there is behind a bearer token, so no object URL.
- `premium/` and `shared/premium/` — the **Premium** subscription, sold through Stripe
  Checkout (`BillingService`, `EntitlementService`). Checkout is Stripe's own page
  (nothing of Stripe's loads on our pages, so the price on `/premium` is the build's
  `PREMIUM_BASE_PRICE_USD`). The surfaces agree on what Premium *is* through one list,
  `shared/premium/premium-perks.ts`, which follows the build flags so a build with a
  feature switched off cannot sell it; and on what it *looks like* through one global
  class, `.premium-badge` in `styles.css`. `/premium` is the only page for any of it:
  Free and Premium side by side, a subscriber's status / next charge / last day / billing
  portal where the Subscribe button sits for others, and the welcome straight after
  checkout. `/pricing` and `/account` survive only as `RedirectFunction` redirects here —
  built that way so the query string comes with them: a checkout created before the move
  still returns to `/account?checkout=success`. `EntitlementService` **follows the
  session** like `AccountService` (sign-in is a router navigation; a load done once at
  bootstrap missed everyone who signed in during the session). The header sells Premium
  only to an account that has not bought it (`plan()` in `app.ts`, null until the
  entitlement has landed); the account menu carries one Premium item for everyone; the
  landing nav links the price wherever payments are on (a payment provider's review wants
  it reachable from the navigation).
- The **new-projection page's preview**: while the AI projection is locked,
  `projection-create` never asks for the model's lines (the BFF would refuse, and the
  request would only draw the failure state) and fills the preview's slot with a pitch
  panel instead. The slot is the same height either way, so picking a starting point does
  not drop the page. Both pages still handle a **403**: the pages hold the locked request
  back themselves, so reaching one means a subscription lapsed mid-session or the
  entitlement read failed. `shared/premium/premium-refused.ts` is the one message for it,
  and it deliberately does not say "try again".
- `interceptors/` — HTTP interceptors. `authInterceptor` attaches the JWT and refreshes
  once on 401. **Only a 401/403 from `/auth/refresh` itself ends the session**: a status 0
  or 5xx on the refresh keeps both tokens and fails the original call into its own error
  state, since it says nothing about the refresh token. Parallel 401s share one in-flight
  refresh (`AuthService.refresh()`). `retryInterceptor` (outermost) retries transient
  gateway/connection errors (status 0/502/503/504) just twice with a short backoff
  (~250ms, 500ms) — don't add your own retry loops on top, and it deliberately does **not**
  ride out a full service restart (zero-downtime deploys' job). `timeoutInterceptor`
  sits inside it and bounds every attempt (20 s read, 60 s write): a timeout fails as
  `RequestTimeoutError` and is not retried.
- `models/`, `pipes/`, `shared/` (e.g. `loading-indicator`)
  - `shared/pinned-table-header` — holds a wide table's `<thead>` against the top of the
    window while the page scrolls past it. The wrapper stays a horizontal scroll
    container for the stat columns, and `overflow-x: auto` makes it the scrollport on
    both axes — so a sticky `thead` has nothing to stick to and the row group is
    translated instead, by a scroll-driven CSS animation (`styles.css`) with a per-frame
    fallback for browsers without scroll timelines. **Where the pin begins is named, not
    measured**: anchored to `exit-crossing`, the table's own top edge crossing the top
    of the window. A page that floats a bar over its top (the landing nav) sets
    `--pinned-header-inset` to that bar's height, registered with `@property` as a
    `<length>`. **iOS takes neither path**: there the directive follows the page only
    while it moves slowly enough to be followed (under `FLICK_PX_PER_EVENT`), hides the
    header when it moves faster, and places it with a fade once still for
    `SCROLL_SETTLE_MS`. The `<thead>` stays `position: sticky` even though it pins
    nothing: the rank and name cells inside it are the frozen columns and iOS places
    every sticky box from its scrolling thread — with the group sticky they ride along
    with its translation. No `will-change`.
- `environments/` — `environment.ts` (dev: `apiUrl: http://localhost:8080/api/v1`),
  `environment.staging.ts` (staging BFF; used by `npm run start:staging`, which requires
  the staging BFF to allow `http://localhost:4200` as a CORS origin — see `DEPLOYMENT.md`),
  and `environment.prod.ts` (`API_URL` injected at build time — see `Dockerfile`).

## Error handling

**Assume every call to the BFF can fail** — never let a failed call fail silently. Every
`.subscribe({…})` / `firstValueFrom(…)` / `rxResource` that reaches the BFF must have an
error path ending in one of these:

- **Transient blips** are already absorbed by `retryInterceptor` (status 0/502/503/504,
  twice). Don't add your own retry loops on top.
- **Page / data loads** (`rxResource`, a load in `ngOnInit`): render the shared
  `app-error-state` (`shared/error-state`) with a **Try again** button that reloads the
  resource. Pass the failure itself as `[error]`: a failure on our side (5xx, timeout,
  status 0 while online) then says so instead of asking the reader to check their
  connection.
- **Discrete user actions** (delete, create, open, connect): transient toast via
  `NotificationService.error(...)`, and reset any `isLoading` / `isCreating` flag in the
  same error callback.
- **Autosave** (stat-weight edits, draft picks): flip the inline save status to `'error'`
  ("Couldn't save — changes are unsaved"), not a toast — repeated autosaves must not
  spam notifications.
- **Auth forms**: keep the inline `errorMessage`, derived with
  `messageForError(error, causeMessage)` from `shared/http-error`, so a server-down
  (status 0 / 5xx) shows "can't reach the server" rather than "invalid credentials".

A bare `error: () => {}` is acceptable only with a comment explaining why that particular
failure genuinely isn't worth surfacing.

## Analytics (PostHog)

Usage analytics goes through `services/analytics.service.ts` — **nothing else may import
`posthog-js`**. It's off unless `environment.posthogKey` is set, so local dev and tests
never fetch the library or send anything.

- **Never send the email as the analytics identifier.** Use the account UUID from the
  JWT's `sub` claim (`AuthService.getUserId()`).
- **URLs are redacted before send.** `/reset-password?token=…` and
  `/verify-email?token=…` carry live single-use tokens and PostHog stamps the full URL.
  The `before_send` hook strips them; add a new route with a sensitive query param to
  `REDACTED_QUERY_PARAMS`, and keep the redaction general rather than allowlisting
  routes.
- **`posthog-js` is imported dynamically, deliberately** (~230 kB; a static import puts
  the initial bundle within a few kB of the 1 MB budget error in `angular.json`).

Autocapture and session replay are off. Turning either on is a deliberate step with its
own privacy review, not a default.

## Error reporting (Sentry)

Browser faults go through `services/error-reporting.service.ts` — **nothing else may
import `@sentry/browser`**. Off unless `environment.sentryDsn` is set, so local dev, CI
and tests never fetch the SDK or send anything.

- **Uncaught errors and unhandled rejections** reach it via `ReportingErrorHandler`,
  which reports and then delegates to Angular's default handler so the console still
  gets them. `provideBrowserGlobalErrorListeners()` routes rejections there.
- **One error is deliberately not reported**: a stale-build chunk failure the router is
  already reloading for (`isRecoveringFromStaleBuild` in `shared/navigation-error.ts`) —
  the same failure arrives twice (router handler, then rethrow) and it would raise an
  alert on every deploy for something the user never saw. It still reaches the console,
  and a genuinely broken build reports via the navigation handler's notification.
- **Handled failures report too**: `NotificationService.error(...)` is the single funnel
  for a failed discrete user action, so it reports as well as renders.
- **Never send the email as the identifier** (UUID from `sub`, as with analytics).
- **URLs are redacted before send**, sharing `shared/redact-url.ts` with analytics; add
  sensitive query params to `REDACTED_QUERY_PARAMS` there and both paths are covered.
- **`@sentry/browser` is imported dynamically** — same 1 MB bundle reason.
- **The DSN is not a secret** (it only permits sending events) but it is
  per-environment: `SENTRY_DSN` build arg, and `environmentName` becomes Sentry's
  `environment`.
- **The CSP has to allow the ingest host**: `connect-src` in `nginx.conf` lists
  `https://*.ingest.de.sentry.io` — without it every report is blocked and the feature is
  silently dead in production.

Performance tracing is off (`tracesSampleRate: 0`): a stream of spans would bury the
faults this exists to surface.

## Conventions

@.aiassistant/rules/guidelines.md

- Never hand-edit `src/app/api/**` — it's generated.
- Run `npm run format` before committing; `format:check` is enforced in CI.
- Keep API calls going through the generated client + a service wrapper, not raw
  `HttpClient` in components.

### Icons

**Every icon comes from `<app-icon name="…" />`** (`src/app/shared/icon/`), drawn from the
Lucide set through `@ng-icons/lucide. Never write an `<svg>` into a template, and never
type a character where an icon belongs (an arrow `←`/`▼`, a check `✓`, a pencil `✎` — in
a template, a returned string, or CSS `content`); `.github/scripts/check-inline-icons.sh`
(in `pr-checks.yml`) fails the build on either.

One spec, Lucide's: 24×24 grid, no fill, `currentColor`, stroke width 2, round caps and
joins, `aria-hidden`. Only the size is settable, and only on the scale (`IconSize`): 14
inline with text, 16 on a button or menu (the default — leave it out), 20 standalone, 48
for an empty or error state; an `em` length for an icon that must scale with its text
(like `size="0.85em"` in a Premium badge). Colour comes from the surrounding text, so an
icon follows hover, disabled and danger states without being told.

Adding one: import the Lucide export in `icon.ts`, give it a line in `ICONS`, **named for
what the icon is for rather than what it looks like** (`close`, not `x`), and look on
lucide.dev first. **Never draw an icon by hand** — if nothing in Lucide fits, write a
prompt Alexander can give an image generator, and say the result still has to become a
24×24 stroke drawing before it joins the set. **Brand marks (Yahoo, Google, Facebook) are
not icons**: they stay inline, in the guard script's allowlist.

### Mobile / responsive layout

Mobile users aren't our top priority, but they must still get an **at least acceptable**
experience: **for every UI change, double-check it holds up on a narrow (phone)
viewport**. Sanity-check around **375px** (breakpoint `max-width: 640px`); quickest is
`npm run start:staging` + a screenshot of the affected page at 375px (a throwaway
Playwright script works well). Common breakers: wide tables (the projections table — the
sticky rank/player columns must stay compact, #161), fixed widths, horizontal overflow.

## End-to-end tests (Playwright)

`e2e/` drives a real browser against the **deployed staging** app
(`https://staging.slapstat.com`), not a local build. `e2e.yml` runs **daily at 06:00 UTC**
and on manual dispatch (`gh workflow run e2e.yml`) — so a merge that touches a page the
suite walks (`/draft`, `/projections/new`, the editor, the board) is **not** checked until
the next morning unless someone dispatches the run. Deliberately **not a PR gate**: the
suite tests deployed staging, so a PR's own changes aren't there — gating on it would
judge a PR by unrelated code and deadlock the PR that fixes a red suite.

- **A failing run opens a GitHub issue** (label `e2e-red`), comments on it while it stays
  open, and closes it once the suite is green again — an alarm nobody stands down stops
  being one.
- Locally: `npx playwright install chromium` (once), then `npm run e2e`. The signed-in
  tests read `E2E_EMAIL` / `E2E_PASSWORD` (env locally, repo secrets in CI) and skip
  without them; the happy path registers a fresh account per run. `e2e/` lives outside
  `src/`, so lint / format:check / unit tests don't touch it. See `e2e/README.md`.
- **Policy**: keep and grow the suite as long as it stays cheap to maintain — stable
  role/id selectors, independent tests, retire a test that turns slow or flaky rather than
  letting it rot. E2E complements the unit tests, never replaces them.

## CI / workflow

- `.github/workflows/pr-checks.yml`: Node 22, generates the API client then runs every
  check listed under [Common commands](#common-commands) on PRs to `master`.
- **Copy is checked, not merely guided**: `npm run check:copy` reads `COPY-RULES.md` and
  fails on a new terminology, vocabulary or punctuation violation, ratcheted against
  `.github/copy-baseline.json`. Tone, rhythm and whether a sentence should exist at all
  are the `slapstat-copy` skill's job — no rule in `COPY-RULES.md` tries to reach them.
- A **spec drift check** runs first: fetches `fantasy-bff`'s `specs/bff-openapi.yaml` from
  `master` and fails if the pinned copy differs. Needs the repo secret `SPEC_READ_TOKEN`
  (fine-grained PAT with read access to `fantasy-bff`).
- `specs/bff-openapi.yaml` is a **verbatim pinned copy** of the BFF's spec. To update after
  a BFF API change: copy the new `fantasy-bff/specs/bff-openapi.yaml` over it and run
  `npm run generate:api`.

## Monorepo conventions

The full set lives in the monorepo root `CLAUDE.md`. In short — the web talks only to the
BFF. Branch → push → PR → checks pass → **squash merge** to `master` (the PR title becomes
the commit message; make it a proper `feat:`/`fix:` message and merge with an explicit
`--subject`). No attribution trailers. Never merge a PR titled "wip"/"draft".

Two that land differently here: the web's form validation (`maxLength` mirroring the BFF's
`@Size` caps) is a **UX convenience, not a security boundary** — the BFF re-validates
regardless; and environment-specific values arrive as **build-time** args (`API_URL`,
`GOOGLE_CLIENT_ID`, `SENTRY_DSN` → `environment.prod.ts`), never hardcoded in committed
config.

## Deployment

- Deployed via **Coolify** (Hetzner) with the multi-stage `Dockerfile` (Node build →
  nginx, see `nginx.conf`). The public pages (`/`, `/premium`, `/terms`, `/privacy`) are
  prerendered at build time into their own `index.html`
  (`app.routes.server.ts`, `app.config.server.ts`), so a client that runs no JavaScript
  reads their content; every other route falls back to the unrendered shell
  `index.csr.html`. Code that runs while those pages render must not touch browser
  globals (`localStorage`, `window`) without `isPlatformBrowser`, and prerendering makes no
  API call but `/api/v1/features`. `check-prerendered-pages.sh` fails CI if a page renders
  empty. Every build arg in `DEPLOYMENT.md`'s table is injected into
  `environment.prod.ts` at build time (`API_URL` also into `nginx.conf`); CI holds the
  table to the Dockerfile's ARGs. Production = `slapstat.com` (`api.slapstat.com`),
  staging = `staging.slapstat.com` (`api.staging.slapstat.com`).
- A merge to `master` deploys **staging** (`tag-on-merge.yml` tags it and stamps
  `APP_VERSION`); **publishing the draft release** deploys production (`promote-to-prod.yml`).
  See `DEPLOYMENT.md`.
