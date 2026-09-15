#!/usr/bin/env bash
#
# The public pages must reach a client that runs no JavaScript with their content in the HTML.
#
# Paddle's automated domain review read slapstat.com that way and found only the page title, three
# times, and called the site "under construction". The pages are prerendered at build time for
# exactly that reader (src/app/app.routes.server.ts). A prerender that quietly produces an empty
# page, or a route that falls back to client rendering, breaks nothing a browser would notice, so
# this reads the built files the way that reader does.
#
# Run after `npm run build`. /premium is not checked here: CI builds with PAYMENTS_ENABLED unset, and
# the page then prerenders as a redirect home, which is what it should be in that build.
set -euo pipefail

out=dist/fantasy-web/browser

# path|text that only that page's own content contains
checks=(
  "index.html|Prepare for the upcoming"
  "terms/index.html|merchant of record"
  "privacy/index.html|Privacy policy"
  "refunds/index.html|Refund policy"
)

failed=0
for check in "${checks[@]}"; do
  file="${out}/${check%%|*}"
  text="${check#*|}"
  if [ ! -f "$file" ]; then
    echo "::error::${file} was not prerendered."
    failed=1
    continue
  fi
  # What a reader that runs no scripts sees: tags, scripts, styles and noscript fallbacks removed.
  visible=$(sed -e 's/<script[^>]*>[^<]*<\/script>//g' -e 's/<[^>]*>/ /g' "$file" | tr -s ' \n' ' ')
  if ! grep -qF -- "$text" <<< "$visible"; then
    echo "::error::${file} does not contain \"${text}\" outside its markup; the prerender rendered no content."
    failed=1
  fi
done

if [ ! -f "${out}/index.csr.html" ]; then
  echo "::error::${out}/index.csr.html is missing; nginx serves it for every client-rendered route."
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo "The public pages are prerendered with their content, and the client-rendered shell exists."
