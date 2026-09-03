# CLAUDE.md — fantasy-web

Angular frontend for the fantasy hockey draft tool. Fantasy managers log in,
make predictions for the upcoming NHL season, and get a ranking of players
based on their league/scoring settings. Talks only to `fantasy-bff`.

## Tech stack

- Angular 21.2.6, TypeScript 5.9, RxJS 7.8
- Standalone components, signals
- Tests: Vitest (via `ng test`), ng-mocks, jsdom
- Lint: ESLint 10 + angular-eslint; Format: Prettier
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
```

CI runs (and must pass): `generate:api`, `lint`, `format:check`, `test`, `build`.

> **After cloning, run `npm run generate:api` once** — `src/app/api` is generated,
> not committed, so lint/test/build will fail until it exists.

## Architecture (`src/app/`)

- `api/` — **generated** client (`fn/`, `models/`), **not committed** (gitignored).
  Generated from the pinned `specs/bff-openapi.yaml` via `npm run generate:api`
  (CI runs this after `npm ci`). Do not hand-edit.
- `auth/` — `login`, `register`, shared `auth-form`
- `draft-projection/` — main feature: `projection-settings-section`,
  `scoring-type-section`, `scoring-stats-section`, `player-projections-table`,
  `share-dialog` (publishing the projection as a public link).
  The player pool moves under a saved projection — a new season brings a new roster, trades
  and call-ups follow — and the **BFF** adds the newcomers on the read that notices, seeding
  them from what the projection started as. It never removes: a row whose player has left the
  pool is kept, and **the table is what hides it** (`droppedPlayerCount`, which counts the rows
  it cannot draw). So the two notices divide the work — `shared/player-pool-notice` reports the
  additions from `poolReconciliation`, once per pool change, and the table says how many rows are
  hidden, which only it can know. The editor also carries `playerBasis` / `playerPoolSyncedAt`
  through `ProjectionState` untouched, so a save doesn't drop them.
  The table also marks **rookies** (a badge by the name, plus a "Rookies only" filter) from
  `GET /api/v1/players/rookies`. That endpoint answers `known: false` wherever the projection
  service is not running — production, today — and a failed request leaves the resource without
  a value; both must read as _no marker and no filter_, never as every player being a veteran.
  `rookieIds` is therefore null in both cases, and is taken via `hasValue()` because reading a
  resource in an error state throws.
- `draft-start/` — the **Draft Mode** page (`/draft`): picks what a draft is drafted
  against, across three kinds of source — the presets, the user's own projections, and
  boards copied from someone's share link. Drafts left mid-way lead the page as cards,
  since resuming one is what most visits are for; **the card itself is the button** (a
  chevron and a "Resume draft" / "View summary" label at its edge), with discard and
  open-the-projection behind a kebab. Below it, starting a draft is **one choice made in
  steps**: a tile per kind of source (each saying what it holds, so the two not open are
  still accounted for), the radio rows of the open kind, and a single **Start draft**
  button, the only filled button on the page. `projection-create` asks the same question
  with the same tiles: the three presets and "Copy a board" as four cards, the boards
  behind the fourth in a `<select>` grouped by yours / shared with you, so a user with a
  handful of projections no longer faces ten radios. The first row of the open kind is
  checked from the start (`selection`, a
  `linkedSignal` that keeps a pick whose row survives a reload), so a preset draft is
  still one press away. The shared kind carries the paste field; `shareTokenFrom` accepts
  a whole URL, a `/s/…` path, or a bare token, and a name clash (409) asks for a name
  rather than reporting a failure the user cannot act on. An import switches to that kind
  and checks the copy.
  History, for anyone tempted to relitigate: the three kinds were tabs (#406), then all
  three lists at once with a button per row (#459, #503), then a hierarchy of filled and
  outlined buttons (#505). Eight buttons on one page was still too much; folding two of
  the three kinds behind tiles that name their contents is the compromise.
  A preset draft has no projection behind it, so starting one creates a projection of
  kind `preset_draft` (seeded server-side via `source: default`) purely to hold the picks;
  `ProjectionStorageService.listProjections()` filters that row out so it never shows up
  as the user's own work, and `listWithPresetDrafts()` is the one place it is wanted.
  A third reading, `listEditable()`, is everything that can be opened in the editor —
  the user's own plus imported boards, preset drafts excluded — and is what
  `projection-list` lists. `projection-create` deliberately keeps `listProjections()`:
  it asks whether the user already has a projection of their own, and an imported copy
  is not one. An imported card says whose board it is and offers no Share, since a share
  credits the account that publishes it.
  Both sources then run the same board in `draft-mode/`.
- `shared-projection/` — the page behind a share link (`/s/:token`), public and unguarded: a
  share link has to open for someone who has never signed in. A signed-in visitor is offered
  "Draft Mode", which copies the snapshot into their own projections and opens the board; a
  signed-out one still gets the sign-up. A 409 there means they already hold a copy, so it
  points at Draft Mode instead of reporting an error. It renders the **snapshot** the
  owner published — the top rows with identity, rank and value frozen into them — so it needs
  no player read model and no ranking of its own. It renders the editor's own `player-row` and
  `projections-table-header` in a **read-only** mode, so a shared projection looks like the
  table it was published from — but it does **not** reuse the scoring: those values were
  computed against the owner's whole player pool, and recomputing them over the hundred
  published rows would quietly print different numbers than were shared. Sharing is the marketing loop, so both ends
  are measured (`projection_shared`, `shared_projection_viewed`).
  Crawlers never reach this component: `nginx.conf` routes link-preview user agents for `/s/*`
  to the BFF's per-share Open Graph document, since they run no JavaScript and would otherwise
  unfurl every shared projection as the site-wide preview. The BFF origin is substituted into
  `nginx.conf` at image build time from the same `API_URL` build arg as the bundle.
  The preview's image is the BFF's per-share card, proxied through this origin at
  `/s/:token/og-image.png` so the tags and the image they point at share a host. That
  location must stay above the static-asset location, which would otherwise claim any URL
  ending in `.png` and 404 it.
- `admin/` — admin-only tools (`/admin`): the Yahoo service account, the player sync, and a
  **Yahoo access probe**. The probe asks Yahoo one question — will it serve this game's players? —
  for a game key and season you type in, and shows the status and Yahoo's own error wording. A
  failed sync only says that _something_ was refused; this is how you find out what. A refusal is
  a **result, not an error**: showing "could not reach the probe" over Yahoo's own 403 would waste
  the whole feature, so only a failure of our own call surfaces as an error.
- `profile/` — the account's **public name** (`/profile`, signed-in only). Sharing forces the
  choice, but a name has to be changeable afterwards: a shared page credits the current one.
  `AccountService` caches it in a signal, because the share dialog and this page both need to
  know whether a name exists without re-fetching.
- `services/` — app services (auth, projections, etc.)
- `interceptors/` — HTTP interceptors: `authInterceptor` attaches the JWT and refreshes
  once on 401 (all environments). `retryInterceptor` (outermost) is a small **always-on**
  safety net: it retries transient gateway/connection errors (status 0/502/503/504) just
  twice with a short backoff (~250ms, 500ms) to absorb a momentary blip. It deliberately
  does **not** try to ride out a full service restart — that's the job of zero-downtime
  deploys, not a long client-side wait.
- `models/`, `pipes/`, `shared/` (e.g. `loading-indicator`)
  - `shared/pinned-table-header` — holds a wide table's `<thead>` against the top of the window
    while the page scrolls past it. The projections table runs down the page rather than inside a
    viewport-tall scrollbox, but its wrapper stays a horizontal scroll container for the stat
    columns — and `overflow-x: auto` makes that wrapper the scrollport on both axes, so a sticky
    `thead` has nothing to stick to. The row group is translated instead — by a scroll-driven CSS
    animation (`styles.css`), so the browser runs the pin off the main thread and the header keeps
    up with a fast flick rather than trailing the rows and catching up at rest. The directive only
    measures what the timeline can't work out for itself — how far the header may travel — and
    keeps the old per-frame scroll handler for browsers without scroll timelines. **Where the pin
    begins is named, not measured**: the range is anchored to `exit-crossing`, the table's own top
    edge crossing the top of the window. It was once a measured window height, and every way that
    height could change without the measurement being redone (a zoom step, a phone collapsing its
    toolbars) parked the header that many pixels down the table for the rest of the scroll.
    A page that floats a bar over its top (the landing nav) sets `--pinned-header-inset` to that
    bar's height; it is registered with `@property` in `styles.css` as a `<length>`, because the
    fallback path reads the value back and an unregistered custom property returns raw tokens.
- `environments/` — `environment.ts` (dev: `apiUrl: http://localhost:8080/api/v1`),
  `environment.staging.ts` (points at the staging BFF `api.staging.slapstat.com`; used by
  `npm run start:staging` via the `staging` build/serve configs in `angular.json`),
  and `environment.prod.ts` (API URL injected at build time via the `API_URL` build arg —
  see `Dockerfile`). `start:staging` lets you run the web locally against staging without
  booting the backend services — it requires the staging BFF to allow
  `http://localhost:4200` as a CORS origin (configured in `fantasy-bff`'s
  `application-staging.yaml`).

## Error handling

**Assume every call to the BFF can fail** — the BFF may be down, the network may drop, a
request may time out. Never let a failed call fail silently; always surface it to the user.
When you add or change a BFF call, handle its failure path with one of these patterns:

- **Transient blips** are already absorbed by `retryInterceptor` (retries status
  0/502/503/504 twice). Don't add your own retry loops on top.
- **Page / data loads** (an `rxResource`, or a load in `ngOnInit`): render the shared
  `app-error-state` component (`shared/error-state`) with a message and a **Try again**
  button that reloads the resource — see `projection-list` / `projection-create`.
- **Discrete user actions** (delete, create, open, connect): show a transient toast via
  `NotificationService.error(...)` (rendered by `app-toast` at the app root), and reset any
  `isLoading` / `isCreating` flag in the same error callback.
- **Autosave** (stat-weight edits, draft picks): flip the inline save status to `'error'`
  ("Couldn't save — changes are unsaved") instead of a toast, so repeated autosaves don't
  spam notifications.
- **Auth forms** (login / register / …): keep the inline `errorMessage`, and derive it with
  `messageForError(error, causeMessage)` from `shared/http-error` so a server-down
  (status 0 / 5xx) shows "can't reach the server" rather than a misleading
  "invalid credentials".

Every `.subscribe({…})` / `firstValueFrom(…)` / `rxResource` that reaches the BFF must have
an error path ending in one of the above. A bare `error: () => {}` is acceptable only with a
comment explaining why that particular failure genuinely isn't worth surfacing.

## Analytics (PostHog)

Usage analytics goes through `services/analytics.service.ts` — **nothing else may import
`posthog-js`**. It's off unless `environment.posthogKey` is set (same pattern as an empty
`googleClientId` hiding the Google button), so local dev and tests never fetch the library or
send anything.

Three constraints that aren't obvious from the code:

- **Never send the email as the analytics identifier.** Use the account UUID from the JWT's
  `sub` claim (`AuthService.getUserId()`). The `email` claim sits in the same token payload,
  so it's an easy mistake, and it would stamp PII onto every event row.
- **URLs are redacted before send.** `/reset-password?token=…` and `/verify-email?token=…`
  carry live single-use tokens, and PostHog stamps the full URL onto `$current_url`. The
  `before_send` hook strips them. If you add a route with a sensitive query param, add it to
  `REDACTED_QUERY_PARAMS` — and keep the redaction general rather than allowlisting routes.
- **`posthog-js` is imported dynamically, deliberately.** It's ~230 kB; a static import puts
  the initial bundle within a few kB of the 1 MB budget error in `angular.json`.

Autocapture and session replay are off. Turning either on is a deliberate step with its own
privacy review (replay would otherwise record sign-up forms), not a default.

## Error reporting (Sentry)

Browser faults go through `services/error-reporting.service.ts` — **nothing else may import
`@sentry/browser`**. It's off unless `environment.sentryDsn` is set (same pattern as an empty
`posthogKey`), so local dev, CI and tests never fetch the SDK or send anything.

It exists because a user lost a saved projection on 2026-08-13 and the only reason anyone found
out was an emailed photograph of their screen a day later. The four backend services had reported
to Sentry for months; the browser reported nowhere.

- **Uncaught errors and unhandled rejections** reach it via `ReportingErrorHandler`, which
  reports and then delegates to Angular's default handler so the console still gets them.
  `provideBrowserGlobalErrorListeners()` is what routes rejections there.
- **One error is deliberately not reported**: a stale-build chunk failure the router is already
  reloading for (`isRecoveringFromStaleBuild` in `shared/navigation-error.ts`). The router calls
  the navigation error handler and _then_ rethrows, so the same failure arrives twice — and it
  was raising a Sentry alert on every deploy for something the user never saw. It still reaches
  the console, and a build that is broken rather than stale still reports, through the
  notification the navigation handler shows when reloading did not help.
- **Handled failures report too.** `NotificationService.error(...)` is the single funnel for a
  discrete user action that failed, so it reports as well as renders — telling the user and
  telling ourselves are the same event.
- **Never send the email as the identifier.** Use the account UUID from the JWT's `sub` claim
  (`AuthService.getUserId()`), exactly as with analytics.
- **URLs are redacted before send**, sharing `shared/redact-url.ts` with analytics. Add a new
  sensitive query param to `REDACTED_QUERY_PARAMS` there and both paths are covered.
- **`@sentry/browser` is imported dynamically**, deliberately — a static import puts the initial
  bundle near the 1 MB budget error in `angular.json`.
- **The DSN is not a secret** (it only permits sending events), but it is per-environment: it
  arrives via the `SENTRY_DSN` build arg, and `environmentName` becomes Sentry's `environment` so
  one project separates staging from production the same way the Java services do.
- **The CSP has to allow the ingest host.** `connect-src` in `nginx.conf` lists
  `https://*.ingest.de.sentry.io`; without it every report is blocked in the browser and the
  feature is silently dead in production.

Performance tracing is off (`tracesSampleRate: 0`) for the same reason the backends keep alerting
narrow: a stream of spans would bury the faults this exists to surface.

## Conventions

@.aiassistant/rules/guidelines.md

- Never hand-edit `src/app/api/**` — it's generated.
- Run `npm run format` before committing; `format:check` is enforced in CI.
- Keep API calls going through the generated client + a service wrapper, not raw
  `HttpClient` in components.

### Mobile / responsive layout

Mobile users aren't our top priority, but they must still get an **at least
acceptable** experience. For **every UI change, double-check it holds up on a narrow
(phone) viewport** — never ship something that only works on desktop.

- Sanity-check around **375px**; the app's responsive breakpoint is `max-width: 640px`
  (media queries live in `styles.css` and the component CSS).
- Quickest check: `npm run start:staging`, then screenshot the affected page at a
  375px viewport (a throwaway Playwright script works well).
- Common breakers: wide tables (the projections table especially — the sticky
  rank/player columns must stay compact so the stat columns stay scroll-visible,
  see #161), fixed widths, and horizontal overflow.

## End-to-end tests (Playwright)

`e2e/` holds Playwright E2E tests that drive a real browser against the **deployed
staging** app (`https://staging.slapstat.com`), not a local build. `e2e.yml` runs them
**on every merge to `master`** (waiting for the new bundle to reach staging first),
**daily** at 06:00 UTC, and on manual dispatch.

They are deliberately **not** a PR gate. The suite drives _deployed_ staging, so a PR's
own changes aren't there to test — gating on it would judge a PR by unrelated code and
deadlock the PR that fixes a red suite.

**A failing run opens a GitHub issue** (label `e2e-red`), comments on it while it stays
open, and closes it once the suite is green again — an alarm nobody stands down stops being
one. That exists because the suite once reproduced a data-loss bug nightly for five days
and the only trace was a red cross nobody read.

- Run locally: `npx playwright install chromium` (once), then `npm run e2e`.
- The signed-in tests use a throwaway staging account: the signed-in test reads
  `E2E_EMAIL` / `E2E_PASSWORD` (env locally, repo secrets in CI) and skips without
  them; the happy-path registers a fresh account per run. See `e2e/README.md`.
- `e2e/` lives outside `src/`, so lint / format:check / unit tests don't touch it.

**Policy:** keep and grow the E2E suite as long as it stays cheap to maintain —
prefer stable role/id selectors, keep tests independent, and retire a test that
turns slow or flaky rather than letting it rot. E2E complements the unit tests, it
doesn't replace them.

## CI / workflow

- `.github/workflows/pr-checks.yml`: Node 22, generates the API client then runs
  lint + format:check + test + build on PRs to `master`.
- A **spec drift check** runs first: it fetches `fantasy-bff`'s `specs/bff-openapi.yaml`
  from `master` and fails if the pinned `specs/bff-openapi.yaml` differs. Needs a repo
  secret `SPEC_READ_TOKEN` — a fine-grained PAT with read access to `fantasy-bff`.
- `specs/bff-openapi.yaml` is a **verbatim pinned copy** of the BFF's spec. To update
  after a BFF API change: copy the new `fantasy-bff/specs/bff-openapi.yaml` over it and
  run `npm run generate:api`.
- `@claude` mentions on issues/PRs trigger `.github/workflows/claude.yml`.

## Monorepo conventions

The full set lives in the monorepo root `CLAUDE.md`: input validation at every boundary,
secrets only from env, one worktree per agent, and the merge procedure. In short — the web
talks only to the BFF. Branch → push → PR → checks pass → **squash merge** to `master` (the
PR title becomes the commit message; make it a proper `feat:`/`fix:` message and merge with
an explicit `--subject`). No attribution trailers. Never merge a PR titled "wip"/"draft".

Two that land differently on this side: the web's form validation (`maxLength` on the auth
fields, mirroring the BFF's `@Size` caps) is a **UX convenience, not a security boundary** —
the BFF re-validates regardless; and environment-specific values arrive as **build-time**
args (`API_URL`, `GOOGLE_CLIENT_ID`, `SENTRY_DSN` → `environment.prod.ts`), never hardcoded
in committed config.

## Deployment

- Deployed via **Coolify** (Hetzner) using the multi-stage `Dockerfile`: a Node build
  stage produces `dist/fantasy-web/browser`, served by nginx (SPA rewrite `/* →
/index.html`, see `nginx.conf`). The BFF URL + Google Client ID are injected into
  `environment.prod.ts` at build time via the `API_URL` / `GOOGLE_CLIENT_ID` build args.
  production = `slapstat.com` (`api.slapstat.com`), staging = `staging.slapstat.com`
  (`api.staging.slapstat.com`). See `DEPLOYMENT.md`.
