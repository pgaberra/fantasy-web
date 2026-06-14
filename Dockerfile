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
# API_URL is the BFF origin (no trailing slash); GOOGLE_CLIENT_ID is public (shipped to
# the browser by design).
ARG API_URL=http://localhost:8080
ARG GOOGLE_CLIENT_ID=

# Inject the values into environment.prod.ts (replaces the committed placeholders).
RUN sed -i \
  -e "s|http://PLACEHOLDER_FOR_PROD_URL|${API_URL}|g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  src/environments/environment.prod.ts

RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/fantasy-web/browser /usr/share/nginx/html
EXPOSE 80
