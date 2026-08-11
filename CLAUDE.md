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
  `share-dialog` (publishing the projection as a public link)
- `draft-start/` — the **Draft Mode** page (`/draft`): picks what a draft is drafted
  against. Either one of the user's projections, or the "Last Season's Stats" preset.
  A preset draft has no projection behind it, so starting one creates a projection of
  kind `preset_draft` (seeded server-side via `source: default`) purely to hold the picks;
  `ProjectionStorageService.listProjections()` filters that row out so it never shows up
  as the user's own work, and `listWithPresetDrafts()` is the one place it is wanted.
  Both sources then run the same board in `draft-mode/`.
- `shared-projection/` — the page behind a share link (`/s/:token`), public and unguarded: a
  share link has to open for someone who has never signed in. It renders the **snapshot** the
  owner published — the top rows with identity, rank and value frozen into them — so it needs
  no player read model and no ranking of its own. Sharing is the marketing loop, so both ends
  are measured (`projection_shared`, `shared_projection_viewed`).
  Crawlers never reach this component: `nginx.conf` routes link-preview user agents for `/s/*`
  to the BFF's per-share Open Graph document, since they run no JavaScript and would otherwise
  unfurl every shared projection as the site-wide preview. The BFF origin is substituted into
  `nginx.conf` at image build time from the same `API_URL` build arg as the bundle.
  The preview's image is the BFF's per-share card, proxied through this origin at
  `/s/:token/og-image.png` so the tags and the image they point at share a host. That
  location must stay above the static-asset location, which would otherwise claim any URL
  ending in `.png` and 404 it.
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
staging** app (`https://staging.slapstat.com`), not a local build. They are **not**
part of the PR gate — `pr-checks.yml` runs only the unit tests; a dedicated
`e2e.yml` workflow runs the E2E suite **daily and on manual dispatch** (a PR's code
isn't on staging until it merges and deploys).

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

Shared across all four repos (`fantasy-web` → `fantasy-bff` → `fantasy-db-service` +
`fantasy-nhl-service`). The web talks only to the BFF.

### Input validation

**Every service validates its own inbound data independently** — never trust an upstream
caller. The web's form validation (e.g. `maxLength` on the auth fields, mirroring the BFF's
`@Size` caps) is a UX convenience, **not** a security boundary: the BFF re-validates every
request server-side regardless. Keep the two in sync so users get a friendly message before
the server rejects an oversized value.

### Secrets

**Never commit a password, API key, token, or any secret to git — in any environment**,
not even throwaway local-dev credentials. Secrets and environment-specific values come from
build-/run-time env vars (e.g. the BFF URL is injected via `API_URL` into
`environment.prod.ts` at build time), never hardcoded in committed config.

### Merging PRs

Branch → push → PR → checks pass → **squash merge** to `master`. GitHub squash uses the
**PR title** as the commit message, so make it a proper message (`feat: …`, `fix: …`), then
merge with an explicit subject:
```
gh pr merge <n> --squash --delete-branch \
  --subject "feat: describe the change (#<n>)" \
  --body "Optional longer description."
```
Never merge a PR titled "wip"/"draft".

### Commit messages

No attribution trailers (`attribution.commit` / `attribution.pr` are `""` in
`~/.claude/settings.json`, enforced at the tool level).

## Deployment

- Deployed via **Coolify** (Hetzner) using the multi-stage `Dockerfile`: a Node build
  stage produces `dist/fantasy-web/browser`, served by nginx (SPA rewrite `/* →
  /index.html`, see `nginx.conf`). The BFF URL + Google Client ID are injected into
  `environment.prod.ts` at build time via the `API_URL` / `GOOGLE_CLIENT_ID` build args.
  production = `slapstat.com` (`api.slapstat.com`), staging = `staging.slapstat.com`
  (`api.staging.slapstat.com`). See `DEPLOYMENT.md`.
