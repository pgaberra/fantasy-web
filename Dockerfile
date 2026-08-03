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
# YAHOO_SYNC_DISABLED=true flips the Yahoo league-sync UI into its off-season note (between
# NHL seasons there are no leagues to sync); anything else leaves sync enabled.
ARG YAHOO_SYNC_DISABLED=

# Inject the values into environment.prod.ts (replaces the committed placeholders).
RUN sed -i \
  -e "s|http://PLACEHOLDER_FOR_PROD_URL|${API_URL}|g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__FACEBOOK_APP_ID__|${FACEBOOK_APP_ID}|g" \
  -e "s|__FACEBOOK_LOGIN_ENABLED__|${FACEBOOK_LOGIN_ENABLED}|g" \
  -e "s|__APP_ENV__|${APP_ENV}|g" \
  -e "s|__APP_VERSION__|${APP_VERSION}|g" \
  -e "s|__POSTHOG_KEY__|${POSTHOG_KEY}|g" \
  -e "s|__YAHOO_SYNC_DISABLED__|${YAHOO_SYNC_DISABLED}|g" \
  src/environments/environment.prod.ts

RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/fantasy-web/browser /usr/share/nginx/html
EXPOSE 80
