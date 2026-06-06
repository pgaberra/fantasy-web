# Deployment — fantasy-web (Render staging)

The Angular app is deployed to Render as a **static site** defined by
[`render.yaml`](./render.yaml). The backend (BFF) URL is baked into the bundle
at build time, since this is a client-side SPA with no runtime env access.

## How it builds

| Aspect | Value |
|---|---|
| Build command | `npm ci` → substitute BFF URL into `environment.prod.ts` → `npm run build` |
| Publish path | `dist/fantasy-web/browser` |
| Routing | Rewrite `/*` → `/index.html` so client-side routes work on refresh |
| Auto-deploy | On every push to `master` |

The build replaces the `http://PLACEHOLDER_FOR_PROD_URL` token in
`src/environments/environment.prod.ts` with the `API_URL` env var. Because
`apiUrl` is `<placeholder>/api/v1`, set `API_URL` to the BFF **base origin only**.

## Environment variables

| Key | Set by | Example |
|---|---|---|
| `API_URL` | **You, in the dashboard** | `https://fantasy-bff-staging.onrender.com` (no trailing slash, no `/api/v1`) |

## First-time setup

1. Deploy the BFF first (see fantasy-bff `DEPLOYMENT.md`) and copy its URL.
2. Render → **New → Blueprint** → connect this repo. It reads `render.yaml` and
   creates the `fantasy-web-staging` site.
3. Set **`API_URL`** = the BFF URL from step 1. Deploy.
4. Copy the site URL and set it as `WEB_ORIGIN` on the BFF service (for CORS),
   then redeploy the BFF.
5. Open the site and log in with the mock user (`mock@example.com` /
   `mockpassword123`).

## If the blueprint rejects `runtime: static`

Render's static-site schema changes occasionally. Fallback: create the site
manually in the dashboard with the same **build command**, **publish path**, and
a **Rewrite** rule (`/*` → `/index.html`) under the site's Redirects/Rewrites.
