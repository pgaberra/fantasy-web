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
# Premium's price in US dollars ("4.99"), which /premium quotes. Must match the price the BFF's
# STRIPE_PRICE_ID charges.
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
# SPREADSHEET_IMPORT_ENABLED=true shows Import spreadsheet in the projection editor; empty/anything
# else keeps it hidden (default), so the import stays dark until enabled per env.
ARG SPREADSHEET_IMPORT_ENABLED=
# MANUAL_RANKING_ENABLED=true offers the Ranking control in the projection editor, which orders a
# player type by hand instead of by its projected stats; empty/anything else keeps it hidden.
ARG MANUAL_RANKING_ENABLED=
# TIERS_ENABLED=true shows positional tiers (the editor's tier column and breaks, and draft
# mode's tier badges and strip); empty/anything else keeps them hidden (default).
ARG TIERS_ENABLED=
# PREMIUM_COMING_SOON=true keeps the Premium page and badges but disables Subscribe with a note;
# empty/anything else sells Premium as usual (default). Needs PAYMENTS_ENABLED.
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
  -e "s|__PREMIUM_BASE_PRICE_USD__|${PREMIUM_BASE_PRICE_USD}|g" \
  -e "s|__ESPN_LEAGUES_ENABLED__|${ESPN_LEAGUES_ENABLED}|g" \
  -e "s|__WHOS_HOT_ENABLED__|${WHOS_HOT_ENABLED}|g" \
  -e "s|__OFFSEASON_ENABLED__|${OFFSEASON_ENABLED}|g" \
  -e "s|__SPREADSHEET_IMPORT_ENABLED__|${SPREADSHEET_IMPORT_ENABLED}|g" \
  -e "s|__MANUAL_RANKING_ENABLED__|${MANUAL_RANKING_ENABLED}|g" \
  -e "s|__TIERS_ENABLED__|${TIERS_ENABLED}|g" \
  src/environments/environment.prod.ts

RUN npm run build

# A build with payments on must prerender /premium with its price: a payment provider's review
# refuses a paid plan with no price, and the page would otherwise quote none in the browser either.
# CI's prerender check builds without payments.
RUN if [ "$PAYMENTS_ENABLED" = "true" ]; then \
  if ! printf '%s' "$PREMIUM_BASE_PRICE_USD" | grep -qE '^[0-9]+\.[0-9]{2}$'; then \
    echo "PREMIUM_BASE_PRICE_USD must be the Premium price in US dollars, like 4.99, in a build with payments on." >&2; \
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

# Scripts and stylesheets are served from /usr/share/nginx/assets, which the deployed apps mount as
# a volume shared by the old and new container, and publish-assets.sh adds this build's files to it
# before nginx starts (see the script). The directory is created here, owned by nginx, because a new
# named volume takes its contents and owner from the image path it is mounted over. The nginx image
# runs every executable *.sh in /docker-entrypoint.d before it starts nginx, and stops if one fails.
COPY publish-assets.sh /docker-entrypoint.d/40-publish-assets.sh
RUN chmod 755 /docker-entrypoint.d/40-publish-assets.sh \
  && mkdir -p /usr/share/nginx/assets \
  && chown nginx:nginx /usr/share/nginx/assets

# Run nginx as the image's own unprivileged `nginx` user, master process included. The stock image
# already drops its workers to `nginx`, but its master stays root. It can still listen on 80 because
# Docker (20.10 and later) sets net.ipv4.ip_unprivileged_port_start=0 inside a container's network
# namespace, so Coolify's port is unchanged; this would not hold under host networking. A non-root
# master needs a pid file it can write (/run is root's) and to create its temp directories under
# /var/cache/nginx; the `user` directive only means something to a root master and would otherwise
# log a warning on every start. The checks fail the build if a new base image moves those lines.
RUN sed -i -e '/^user /d' -e 's|^pid .*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && ! grep -q '^user ' /etc/nginx/nginx.conf \
  && grep -q '^pid /tmp/nginx.pid;$' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /var/cache/nginx
USER nginx
EXPOSE 80
