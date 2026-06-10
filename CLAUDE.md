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
npm run start:staging  # ng serve locally but point apiUrl at the staging BFF on Render
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
  `scoring-type-section`, `scoring-stats-section`, `player-projections-table`
- `services/` — app services (auth, projections, etc.)
- `interceptors/` — HTTP interceptors (auth token attach, etc.)
- `models/`, `pipes/`, `shared/` (e.g. `loading-indicator`)
- `environments/` — `environment.ts` (dev: `apiUrl: http://localhost:8080/api/v1`),
  `environment.staging.ts` (points at the staging BFF on Render; used by
  `npm run start:staging` via the `staging` build/serve configs in `angular.json`),
  and `environment.prod.ts` (API URL injected at build time on Render via `API_URL`).
  `start:staging` lets you run the web locally against staging without booting the
  backend services — it requires the staging BFF to allow `http://localhost:4200` as a
  CORS origin (configured in `fantasy-bff`'s `application-staging.yaml`).

## Conventions

@.aiassistant/rules/guidelines.md

- Prefer standalone components and signals (Angular 21 style).
- Never hand-edit `src/app/api/**` — it's generated.
- Run `npm run format` before committing; `format:check` is enforced in CI.
- Keep API calls going through the generated client + a service wrapper, not raw
  `HttpClient` in components.

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

- Deployed to Render as a static site. Build injects the BFF URL into
  `environment.prod.ts` via the `API_URL` env var, publishes
  `dist/fantasy-web/browser`, with SPA rewrite `/* → /index.html`.
  See `DEPLOYMENT.md`.
