# Deployment — fantasy-web

The Angular app is deployed via **Coolify** (self-hosted on Hetzner) using the
multi-stage [`Dockerfile`](./Dockerfile): a `node:22-alpine` build stage produces the
static bundle, which an `nginx:alpine` stage serves. The backend (BFF) URL is baked into
the bundle at **build time**, since this is a client-side SPA with no runtime env access.

| Environment | URL | BFF (`API_URL`) |
|---|---|---|
| production | `https://slapstat.com` (+ `www`) | `https://api.slapstat.com` |
| staging | `https://staging.slapstat.com` | `https://api.staging.slapstat.com` |

## How it builds

The Dockerfile runs `npm ci` → `npm run generate:api` → injects build args into
`environment.prod.ts` → `npm run build`, then serves `dist/fantasy-web/browser` with
nginx (SPA rewrite `/* → /index.html`, see [`nginx.conf`](./nginx.conf)). Coolify passes
the build args below as Docker `--build-arg` from the app's build-time env vars.

| Build arg | Purpose | Example |
|---|---|---|
| `API_URL` | BFF **base origin only** (no trailing slash, no `/api/v1`) — replaces the `http://PLACEHOLDER_FOR_PROD_URL` token; `apiUrl` is `<API_URL>/api/v1` | `https://api.slapstat.com` |
| `GOOGLE_CLIENT_ID` | Public Google OAuth Client ID (not a secret). Empty → the "Sign in with Google" button is hidden | `404846934195-…apps.googleusercontent.com` |
| `APP_ENV` | Which deployed environment this bundle is. Set to `staging` on the staging app to show the env banner; leave as `production` (the default) for prod, where no banner renders | `staging` |
| `APP_VERSION` | Optional version label shown next to the env banner (only visible when `APP_ENV=staging`). Numeric values get a `v` prefix; empty → env name alone | `0.1.5` |

## Coolify setup (per environment)

1. Deploy the BFF first and note its origin (the `API_URL` above).
2. Create an application from this repo (GitHub App source, **Dockerfile** build pack),
   set the **Domains** (e.g. `https://staging.slapstat.com`) and the build-time env vars
   `API_URL` + `GOOGLE_CLIENT_ID` (both marked build-time), then deploy. On the **staging**
   app also set `APP_ENV=staging` (and optionally `APP_VERSION`) so the env banner renders.
3. Ensure the BFF's `WEB_ORIGIN` equals this site's origin (for CORS) and redeploy the
   BFF if it changed.
4. DNS: a Cloudflare **A record (DNS only / grey cloud)** for the domain → the server IP,
   so Coolify's Let's Encrypt (HTTP-01) can provision TLS.

> Local dev against a deployed backend: `npm run start:staging` serves the app locally
> pointed at the staging BFF (`environment.staging.ts`) — no need to boot the backend
> services. The staging BFF must allow `http://localhost:4200` as a CORS origin.
