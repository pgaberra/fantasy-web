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
npm start              # ng serve → http://localhost:4200
npm test               # Vitest run
npm run lint           # eslint src/**/*.ts
npm run format         # prettier --write
npm run format:check   # prettier --check (CI uses this — must pass)
npm run build          # production build → dist/fantasy-web/browser
npm run generate:api   # regenerate src/app/api from BFF OpenAPI spec
```

CI runs (and must pass): `lint`, `format:check`, `test`, `build`.

## Architecture (`src/app/`)

- `api/` — **generated** client (`fn/`, `models/`). Do not hand-edit; regenerate
  with `npm run generate:api` against the BFF's OpenAPI spec.
- `auth/` — `login`, `register`, shared `auth-form`
- `draft-projection/` — main feature: `projection-settings-section`,
  `scoring-type-section`, `scoring-stats-section`, `player-projections-table`
- `services/` — app services (auth, projections, etc.)
- `interceptors/` — HTTP interceptors (auth token attach, etc.)
- `models/`, `pipes/`, `shared/` (e.g. `loading-indicator`)
- `environments/` — `environment.ts` (dev: `apiUrl: http://localhost:8080/api/v1`)
  and `environment.prod.ts` (API URL injected at build time on Render via `API_URL`).

## Conventions

- Prefer standalone components and signals (Angular 21 style).
- Never hand-edit `src/app/api/**` — it's generated.
- Run `npm run format` before committing; `format:check` is enforced in CI.
- Keep API calls going through the generated client + a service wrapper, not raw
  `HttpClient` in components.

## CI / workflow

- `.github/workflows/pr-checks.yml`: Node 22, runs lint + format:check + test + build
  on PRs to `master`.
- Branch → push → PR → checks pass → **squash merge** to `master`.
- `@claude` mentions on issues/PRs trigger `.github/workflows/claude.yml`.

### Merging PRs

GitHub squash merge uses the **PR title** as the commit message — the individual
branch commits are ignored. Before merging:

1. Ensure the PR title is a proper commit message (e.g. `feat: add X`, `fix: correct Y`).
   Rename it first with `gh pr edit <n> --title "..."` if needed.
2. Merge with an explicit subject so the commit message is never left to chance:
   ```
   gh pr merge <n> --squash --delete-branch \
     --subject "feat: describe the change (#<n>)" \
     --body "Optional longer description."
   ```

Never merge a PR titled "wip", "draft", or similar.

## Deployment

- Deployed to Render as a static site. Build injects the BFF URL into
  `environment.prod.ts` via the `API_URL` env var, publishes
  `dist/fantasy-web/browser`, with SPA rewrite `/* → /index.html`.
  See `DEPLOYMENT.md`.

## Commit messages

End commit messages with:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
