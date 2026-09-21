#!/usr/bin/env bash
#
# The public pages must reach a client that runs no JavaScript with their content in the HTML.
#
# A payment provider's automated domain review (Paddle's) read slapstat.com that way and found only the page title, three
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
  "terms/index.html|Charges we always refund"
  "privacy/index.html|Privacy policy"
  "register/index.html|Already have an account?"
)

home_title=$(sed -n 's:.*<title>\([^<]*\)</title>.*:\1:p' src/index.html | head -n 1)

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
  # Each page credits itself, not the home page: Google folded /login into the home page when its
  # HTML carried only the home page's head. crawl-tags.ts writes these while prerendering.
  page="/${check%%|*}"
  page="${page%index.html}"
  page="${page%/}"
  if ! grep -qF -- "<link rel=\"canonical\" href=\"https://slapstat.com${page:-/}\">" "$file"; then
    echo "::error::${file} has no canonical link to https://slapstat.com${page:-/}."
    failed=1
  fi
  if [ -n "$page" ] && grep -qF -- "<title>${home_title}</title>" "$file"; then
    echo "::error::${file} carries the home page's title; give its route a title of its own."
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
