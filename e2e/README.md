# End-to-end tests (Playwright)

Full-stack E2E that drive a real browser against the **deployed staging app**
(`https://staging.slapstat.com`).

## Run locally

```bash
npx playwright install chromium   # once
npm run e2e
```

The landing, login-form, invalid-login and projection-persistence tests need no
setup — the last two register their own throwaway account. The **signed-in**
tests require a dedicated throwaway staging account:

```bash
E2E_EMAIL=e2e@slapstat.com E2E_PASSWORD=… npm run e2e
```

Point the run somewhere else with `E2E_BASE_URL` (defaults to staging).

## CI

`.github/workflows/e2e.yml` runs the suite daily and on manual dispatch against
staging. To enable the signed-in tests there, add repo secrets `E2E_EMAIL` and
`E2E_PASSWORD` for a dedicated staging test account. Without them those tests are
skipped (they never fail the run).

Because the tests hit the _deployed_ app, they are not run per-PR (a PR's code is
not on staging until it merges and deploys) — trigger them manually after a
deploy, or rely on the daily run.
