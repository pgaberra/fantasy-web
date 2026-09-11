#!/usr/bin/env bash
#
# Every ARG in the Dockerfile must have a row in DEPLOYMENT.md's build-arg table, and every row
# must still be an ARG.
#
# The table is the checklist for configuring or rebuilding a Coolify app, and a build arg that is
# missing there fails silently: the build succeeds with the value empty, so a build without
# SENTRY_DSN reports no errors and one without PADDLE_PRICE_ID has nothing to sell. The table had
# drifted to 9 of 15 args before anything compared the two. A row for an arg that is gone is the
# other half: it sends someone to set a variable the build ignores.
set -euo pipefail

dockerfile=Dockerfile
doc=DEPLOYMENT.md

args=$(grep -o '^ARG [A-Z0-9_]\+' "$dockerfile" | cut -d' ' -f2 | sort -u)
rows=$(grep -o '^| `[A-Z0-9_]\+`' "$doc" | tr -d '|` ' | sort -u)

undocumented=$(comm -23 <(printf '%s\n' "$args") <(printf '%s\n' "$rows"))
stale=$(comm -13 <(printf '%s\n' "$args") <(printf '%s\n' "$rows"))

if [ -n "$undocumented" ] || [ -n "$stale" ]; then
  if [ -n "$undocumented" ]; then
    echo "::error::Build args in ${dockerfile} with no row in ${doc}'s build-arg table:"
    printf '  %s\n' $undocumented
  fi
  if [ -n "$stale" ]; then
    echo "::error::Rows in ${doc}'s build-arg table that are no longer an ARG in ${dockerfile}:"
    printf '  %s\n' $stale
  fi
  echo "The table is the checklist for configuring a Coolify app, and a missing arg fails silently."
  exit 1
fi

echo "Every build arg in ${dockerfile} has a row in ${doc}, and every row is a build arg."
