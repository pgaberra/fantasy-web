# Deployment — fantasy-web

The Angular app is deployed via **Coolify** (self-hosted on Hetzner) using the
multi-stage [`Dockerfile`](./Dockerfile): a `node:22-alpine` build stage produces the
static bundle, which an `nginx:alpine` stage serves. The backend (BFF) URL is baked into
the bundle at **build time**, since this is a client-side SPA with no runtime env access.

| Environment | URL                              | BFF (`API_URL`)                    |
| ----------- | -------------------------------- | ---------------------------------- |
| production  | `https://slapstat.com` (+ `www`) | `https://api.slapstat.com`         |
| staging     | `https://staging.slapstat.com`   | `https://api.staging.slapstat.com` |

## How it builds

The Dockerfile runs `npm ci` → `npm run generate:api` → injects build args into
`environment.prod.ts` → `npm run build`, then serves `dist/fantasy-web/browser` with
nginx (prerendered pages from their own `index.html`, every other route from `index.csr.html`, see
[`nginx.conf`](./nginx.conf)). The build prerenders the public pages and calls the API's
`/api/v1/features` while doing so, so `API_URL` has to answer at build time for the Premium page to
list the AI projection. Coolify passes
the build args below as Docker `--build-arg` from the app's build-time env vars.

This table is the checklist for configuring or rebuilding a Coolify app, and every row is an
`ARG` in the Dockerfile. `.github/scripts/check-deployment-args.sh` fails CI when the two
disagree. A missing arg fails silently: the build succeeds and the feature is simply off.

| Build arg | Purpose | Example |
| --- | --- | --- |
| `API_URL` | BFF **base origin only** (no trailing slash, no `/api/v1`). Replaces the `http://PLACEHOLDER_FOR_PROD_URL` token, so `apiUrl` is `<API_URL>/api/v1`. The serve stage also writes it into `nginx.conf` as `__API_ORIGIN__`: the one API origin the CSP's `connect-src` allows, and the BFF the share-preview proxies call | `https://api.slapstat.com` |
| `GOOGLE_CLIENT_ID` | Public Google OAuth Client ID (not a secret). Empty → the "Sign in with Google" button is hidden | `404846934195-…apps.googleusercontent.com` |
| `FACEBOOK_APP_ID` | Public Facebook App ID (not a secret). Empty → the "Continue with Facebook" button is hidden. The BFF needs the matching `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` | `000000000000000` |
| `FACEBOOK_LOGIN_ENABLED` | Feature toggle for the "Continue with Facebook" button. `true` shows it; empty/anything-else keeps it **hidden even when `FACEBOOK_APP_ID` is set**. Left unset (hidden) on prod + staging while Facebook login is paused (the Meta app is still in Development / not yet public). Set `true` to re-enable | `true` |
| `APP_ENV` | Which deployed environment this bundle is. Set to `staging` on the staging app to show the env banner; leave as `production` (the default) for prod, where no banner renders. It is also Sentry's `environment`. **Anything but `production` also sends `X-Robots-Tag: noindex` on every response**, so search engines drop that deployment: a prod app with a mistyped value disappears from Google | `staging` |
| `APP_VERSION` | The version this build is: the label next to the staging env banner (numeric values get a `v` prefix), Sentry's `release`, and what the app reports as its own version. **Don't set it by hand**: the release workflows stamp it on every deploy (see [How a version is deployed](#how-a-version-is-deployed)) | `0.1.5` |
| `POSTHOG_KEY` | Public PostHog project key (not a secret). Empty → analytics is off entirely and `posthog-js` is never even fetched. **Staging and production must use different keys**: they're separate PostHog projects, so our own testing never lands in the production numbers | `phc_…` |
| `SENTRY_DSN` | Sentry DSN for browser error reporting. Public by design (it only permits sending events), but per environment. Empty → the build reports **no errors at all** and `@sentry/browser` is never fetched | `https://…@….ingest.de.sentry.io/…` |
| `YAHOO_SYNC_DISABLED` | Manual **off-season switch**. `true` makes the Yahoo league-sync UI show an "available when the new season begins" note instead of its connect/sync controls (between NHL seasons Yahoo has no leagues to sync). Empty/anything-else → sync enabled. Flip it together with the yahoo-service `SYNC_YAHOO_DISABLED` runtime flag | `true` |
| `PAYMENTS_ENABLED` | Turns on the subscription billing UI (the Premium page, badges and checkout). `true` shows it; empty/anything-else keeps the whole payments feature dark (default) | `true` |
| `PREMIUM_COMING_SOON` | Premium **shown but not yet sold**. `true` keeps the Premium page, its prices and the Premium badges, but disables Subscribe with a note and sends `/pay` back to the Premium page; the BFF still gates Premium features, so nobody gets them except through an admin grant. Empty/anything-else → Premium is sold as usual (default). Only meaningful with `PAYMENTS_ENABLED=true` | `true` |
| `PADDLE_CLIENT_TOKEN` | Public Paddle client token (not a secret: it only permits opening a checkout). Its `test_` or `live_` prefix picks sandbox or live Paddle, so there is no separate environment arg. Empty → `/pay` cannot open a checkout | `test_…` / `live_…` |
| `PADDLE_PRICE_ID` | The recurring Paddle price the Premium page quotes and the checkout sells. Public, like the token. Empty → there is no price to show or sell | `pri_…` |
| `ESPN_LEAGUES_ENABLED` | Shows the ESPN provider in the projection's league-sync UI. `true` shows it; empty/anything-else keeps it hidden (default) | `true` |
| `WHOS_HOT_ENABLED` | The one flag with an **inverted default**. `false` hides the Who's hot page (both nav links and the route); empty/anything-else leaves it visible, since the page already ships. A deploy that forgets the arg keeps the page | `false` |
| `OFFSEASON_ENABLED` | Shows the **off-season data notice** in the demo and signed-in projection editors (team affiliations out of date, rookies missing). `true` shows it; empty/anything-else → hidden (default). Its own switch on purpose: `YAHOO_SYNC_DISABLED` can be on for reasons unrelated to the calendar, and that must not announce an off-season | `true` |

> **Both** staging and production build from `environment.prod.ts` (the Dockerfile seds it, and
> `npm run build` uses the `production` configuration). `environment.staging.ts` only backs
> `npm run start:staging`, so the staging/production split comes purely from the build args
> above, not from a per-environment source file.

A Coolify variable that is not in this table is not an `ARG`, so the build ignores it. The
`AI_PROJECTION_ENABLED` and `PADDLE_ENVIRONMENT` args were removed (see `DECISIONS.md`), so a
leftover copy in Coolify does nothing.

### Analytics (PostHog)

Usage analytics runs on **PostHog EU Cloud** (Frankfurt). Two things live outside this repo and
are easy to miss:

1. **Cookieless mode must be enabled in the PostHog project settings.** The app runs
   `cookieless_mode: 'on_reject'`, so anyone who declines the cookie banner is counted via a
   privacy-preserving server-side hash instead. If the project setting is off, PostHog
   **silently discards every one of those events** — declining users would just vanish.
2. **Sign the data processing agreement** (Settings → Organization) before pointing real
   traffic at it.

Events are ingested through `/ingest` on our own domain, proxied to PostHog by `nginx.conf`.
That keeps the CSP at `'self'` and makes the measurement immune to ad blockers. It also means
`X-Forwarded-For` in that proxy block is load-bearing: without the real client IP, every
cookieless (declining) visitor hashes to the same "person".

## Coolify setup (per environment)

1. Deploy the BFF first and note its origin (the `API_URL` above).
2. Create an application from this repo (GitHub App source, **Dockerfile** build pack),
   set the **Domains** (e.g. `https://staging.slapstat.com`) and the build-time env vars
   from the table above that this environment needs: at least `API_URL`, `GOOGLE_CLIENT_ID`,
   `SENTRY_DSN` and `POSTHOG_KEY` (that environment's own DSN and PostHog project), plus
   `PAYMENTS_ENABLED`, `PADDLE_CLIENT_TOKEN` and `PADDLE_PRICE_ID` where it sells Premium. On
   the **staging** app also set `APP_ENV=staging` so the env banner renders and search engines
   stay out. Leave `APP_VERSION` alone: after the first deploy, deploys come from the release
   workflows below rather than from Coolify's own auto-deploy.
3. Allow this site's origin for CORS. There are **three origin lists, and they change
   together**:
   - the BFF's `CORS_ALLOWED_ORIGINS` (comma-separated), which is the list the BFF reads;
   - the BFF's `WEB_ORIGIN`, which the BFF falls back to only while `CORS_ALLOWED_ORIGINS` is
     unset. It also builds the links in emails, so it must be this site's origin either way;
   - the Traefik `api-cors` middleware on the BFF's API routers (a Coolify label,
     `accessControlAllowOriginList`), which answers preflight requests before the BFF sees
     them. Its labels are recorded in `INFRASTRUCTURE.md`, which lives outside git.

   Staging sets `CORS_ALLOWED_ORIGINS` (it also allows `http://localhost:4200` for
   `npm run start:staging`), so changing its `WEB_ORIGIN` does nothing for CORS there.
   Production sets only `WEB_ORIGIN`. Redeploy the BFF after changing either. A list left out
   of step fails as a CORS error, which the browser reports to the app as a network error
   (status 0), not as anything that says CORS.
4. DNS: a Cloudflare **A record (DNS only / grey cloud)** for the domain → the server IP,
   so Coolify's Let's Encrypt (HTTP-01) can provision TLS.

> Local dev against a deployed backend: `npm run start:staging` serves the app locally
> pointed at the staging BFF (`environment.staging.ts`) — no need to boot the backend
> services. The staging BFF must allow `http://localhost:4200` as a CORS origin, in both its
> `CORS_ALLOWED_ORIGINS` and its `api-cors` labels.

## How a version is deployed

Neither environment deploys from Coolify's own git watch. Two workflows do it, and each stamps
`APP_VERSION`, which is why a hand-set value is overwritten on the next deploy.

- **Staging: every merge to `master`.** [`tag-on-merge.yml`](./.github/workflows/tag-on-merge.yml)
  tags the squash commit with a SemVer version read off its Conventional Commit title (`feat:`
  minor, `fix:` and the rest patch, `!` major) and creates that version's GitHub Release as a
  **draft**. It then asks the prod server, over a restricted SSH key
  (`STAGING_VERSION_SSH_KEY`), to set the tag as the staging app's `APP_VERSION` and redeploy.
  This is staging's only deploy path, so a missing key fails the job rather than skipping.
- **Production: publishing the draft release.** Nothing reaches production on a merge.
  Publishing a release fires [`promote-to-prod.yml`](./.github/workflows/promote-to-prod.yml),
  which resolves the tag to its commit and has the prod server (restricted key
  `PROD_PROMOTE_SSH_KEY`) pin that commit, stamp `APP_VERSION` and `SENTRY_RELEASE`, deploy and
  wait for Coolify to call the deploy finished. fantasy-web has no version endpoint a runner can
  read, so Coolify's word is the whole check. A failed promotion leaves the old container
  running and opens a `prod-promotion-failed` issue. To roll back, run the workflow by hand
  with an older tag. A `release` run uses the workflow file from the tagged commit, not from
  `master`.
