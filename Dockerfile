# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps against the lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate the typed BFF API client from the pinned spec (src/app/api is gitignored).
RUN npm run generate:api

# Build-time config, passed by Coolify as --build-arg from the app's build env vars.
# API_URL is the BFF origin (no trailing slash); GOOGLE_CLIENT_ID, FACEBOOK_APP_ID and
# POSTHOG_KEY are public (shipped to the browser by design). APP_ENV marks the deployed
# environment (set to "staging" on the staging app to show the env banner; left as
# "production" otherwise); APP_VERSION is the optional version label shown alongside it.
# POSTHOG_KEY empty disables analytics; staging and prod use different PostHog projects.
ARG API_URL=http://localhost:8080
ARG GOOGLE_CLIENT_ID=
ARG FACEBOOK_APP_ID=
# FACEBOOK_LOGIN_ENABLED=true shows the "Continue with Facebook" button; empty/anything else
# keeps it hidden even when FACEBOOK_APP_ID is set (Facebook login is paused for now).
ARG FACEBOOK_LOGIN_ENABLED=
ARG APP_ENV=production
ARG APP_VERSION=
ARG POSTHOG_KEY=
# Sentry DSN for browser error reporting. Public by design (it only permits sending events),
# and empty disables reporting — so a build without it sends nothing.
ARG SENTRY_DSN=
# YAHOO_SYNC_DISABLED=true flips the Yahoo league-sync UI into its off-season note (between
# NHL seasons there are no leagues to sync); anything else leaves sync enabled.
ARG YAHOO_SYNC_DISABLED=
# PAYMENTS_ENABLED=true turns on the subscription billing UI; empty/anything else keeps the
# whole payments feature dark (default).
ARG PAYMENTS_ENABLED=
# Public Paddle client token. Not a secret: it ships to the browser and only permits opening a
# checkout. Its test_ or live_ prefix is what picks sandbox or live Paddle, so there is no
# separate environment arg. Empty leaves /pay unable to open one, which is the right default
# for a build that does not sell anything.
ARG PADDLE_CLIENT_TOKEN=
# The recurring price the pricing page asks Paddle to quote. Public, like the token.
ARG PADDLE_PRICE_ID=
# Premium's base price in US dollars ("4.99"), stated on the prerendered /premium. Must match the
# base price of PADDLE_PRICE_ID in Paddle's catalog; a browser shows the visitor's local price.
ARG PREMIUM_BASE_PRICE_USD=
# ESPN_LEAGUES_ENABLED=true shows the ESPN provider in the projection's league-sync UI;
# empty/anything else keeps it hidden (default), so ESPN stays dark until enabled per env.
ARG ESPN_LEAGUES_ENABLED=
# WHOS_HOT_ENABLED=false hides the Who's hot page (both nav links and the route); empty/anything
# else leaves it visible (default), since the page already ships.
ARG WHOS_HOT_ENABLED=
# OFFSEASON_ENABLED=true shows the off-season data notice (stale team affiliations, missing
# rookies) in the projection editors; empty/anything else keeps it hidden (default).
ARG OFFSEASON_ENABLED=
# PREMIUM_COMING_SOON=true keeps the Premium page and badges but disables Subscribe with a note
# and closes /pay; empty/anything else sells Premium as usual (default). Needs PAYMENTS_ENABLED.
ARG PREMIUM_COMING_SOON=

# Inject the values into environment.prod.ts (replaces the committed placeholders).
RUN sed -i \
  -e "s|http://PLACEHOLDER_FOR_PROD_URL|${API_URL}|g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__FACEBOOK_APP_ID__|${FACEBOOK_APP_ID}|g" \
  -e "s|__FACEBOOK_LOGIN_ENABLED__|${FACEBOOK_LOGIN_ENABLED}|g" \
  -e "s|__APP_ENV__|${APP_ENV}|g" \
  -e "s|__APP_VERSION__|${APP_VERSION}|g" \
  -e "s|__POSTHOG_KEY__|${POSTHOG_KEY}|g" \
  -e "s|__SENTRY_DSN__|${SENTRY_DSN}|g" \
  -e "s|__YAHOO_SYNC_DISABLED__|${YAHOO_SYNC_DISABLED}|g" \
  -e "s|__PAYMENTS_ENABLED__|${PAYMENTS_ENABLED}|g" \
  -e "s|__PREMIUM_COMING_SOON__|${PREMIUM_COMING_SOON}|g" \
  -e "s|__PADDLE_CLIENT_TOKEN__|${PADDLE_CLIENT_TOKEN}|g" \
  -e "s|__PADDLE_PRICE_ID__|${PADDLE_PRICE_ID}|g" \
  -e "s|__PREMIUM_BASE_PRICE_USD__|${PREMIUM_BASE_PRICE_USD}|g" \
  -e "s|__ESPN_LEAGUES_ENABLED__|${ESPN_LEAGUES_ENABLED}|g" \
  -e "s|__WHOS_HOT_ENABLED__|${WHOS_HOT_ENABLED}|g" \
  -e "s|__OFFSEASON_ENABLED__|${OFFSEASON_ENABLED}|g" \
  src/environments/environment.prod.ts

RUN npm run build

# A build that sells Premium must prerender /premium with its price, because Paddle's domain review
# refuses a paid plan with no price, and nothing a browser shows would give a missing one away. The
# figure is PREMIUM_BASE_PRICE_USD: Paddle.js cannot run here, and Paddle's REST API answers the
# client token with 403 authentication_malformed (#674). CI's prerender check builds without payments.
RUN if [ "$PAYMENTS_ENABLED" = "true" ] && [ -n "$PADDLE_PRICE_ID" ]; then \
  if ! printf '%s' "$PREMIUM_BASE_PRICE_USD" | grep -qE '^[0-9]+\.[0-9]{2}$'; then \
    echo "PREMIUM_BASE_PRICE_USD must be the Premium price in US dollars, like 4.99, in a build that sells Premium." >&2; \
    exit 1; \
  fi; \
  if ! sed -e 's/<[^>]*>/ /g' dist/fantasy-web/browser/premium/index.html | tr -s ' \n' ' ' \
    | grep -qF "\$${PREMIUM_BASE_PRICE_USD} per month"; then \
    echo "premium/index.html was prerendered without its price." >&2; \
    exit 1; \
  fi; \
fi

# ---- Serve stage ----
FROM nginx:alpine
# Re-declared because ARGs do not cross stages. nginx needs the BFF origin server-side to fetch
# the per-share Open Graph document for link-preview crawlers (see nginx.conf).
ARG API_URL=http://localhost:8080
# APP_ENV decides whether search engines may index this deployment: every build that is not
# "production" (staging) sends X-Robots-Tag: noindex on its responses (see nginx.conf).
ARG APP_ENV=production
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN if [ "$APP_ENV" = "production" ]; then ROBOTS_TAG=""; else ROBOTS_TAG="noindex"; fi && \
  sed -i -e "s|__API_ORIGIN__|${API_URL}|g" -e "s|__ROBOTS_TAG__|${ROBOTS_TAG}|g" \
  /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/fantasy-web/browser /usr/share/nginx/html
EXPOSE 80
