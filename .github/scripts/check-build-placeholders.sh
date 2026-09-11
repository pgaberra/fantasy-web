#!/usr/bin/env bash
#
# Every __PLACEHOLDER__ in environment.prod.ts and nginx.conf must be substituted by the Dockerfile.
#
# The files are edited separately and nothing connects them, so it is easy to add a flag to the
# environment and forget its sed line. Nothing then fails: the build succeeds, the placeholder
# survives into the bundle, and the guard that reads it (`startsWith('__X')`) quietly resolves the
# value to empty. The feature is simply off in the deployed app, with no error anywhere. That is
# exactly how the pricing page shipped without a price.
#
# nginx.conf is the same trap with a different failure: a placeholder left in the CSP's
# connect-src is a source no browser can match, so every call to the API is blocked, and one left
# in a proxy_pass sends nginx nowhere. Its substitutions run in the serve stage and do not always
# take a build arg of the same name (__API_ORIGIN__ is filled from API_URL), so for it the check is
# that a sed expression for the placeholder exists in that stage.
#
# Checks only that a substitution exists, not that a value was supplied — an intentionally
# empty build arg is a deployment choice, a missing sed line is a bug.
set -euo pipefail

env_file=src/environments/environment.prod.ts
nginx_file=nginx.conf
dockerfile=Dockerfile

failed=0

missing=()
while read -r placeholder; do
  name=${placeholder//__/}
  if ! grep -qF -- "s|${placeholder}|\${${name}}|g" "$dockerfile"; then
    missing+=("$placeholder")
  fi
done < <(grep -o '__[A-Z0-9_]\+__' "$env_file" | sort -u)

if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::${#missing[@]} placeholder(s) in ${env_file} are never substituted by ${dockerfile}:"
  for p in "${missing[@]}"; do
    name=${p//__/}
    echo "  ${p} — add: -e \"s|${p}|\${${name}}|g\" (and ARG ${name}= if it is missing too)"
  done
  echo "Without it the placeholder survives into the bundle and the feature is silently off."
  failed=1
fi

# The serve stage is everything from the nginx FROM line on; a sed in the build stage edits the
# environment file, not the copy of nginx.conf the image serves.
serve_stage=$(sed -n '/^FROM nginx/,$p' "$dockerfile")
if [ -z "$serve_stage" ]; then
  echo "::error::No 'FROM nginx' stage found in ${dockerfile}; cannot check ${nginx_file}."
  exit 1
fi

missing_nginx=()
while read -r placeholder; do
  if ! grep -qF -- "s|${placeholder}|" <<<"$serve_stage"; then
    missing_nginx+=("$placeholder")
  fi
done < <(grep -o '__[A-Z0-9_]\+__' "$nginx_file" | sort -u)

if [ ${#missing_nginx[@]} -gt 0 ]; then
  echo "::error::${#missing_nginx[@]} placeholder(s) in ${nginx_file} are never substituted by ${dockerfile}'s serve stage:"
  for p in "${missing_nginx[@]}"; do
    echo "  ${p} — add -e \"s|${p}|<value>|g\" to the sed that edits /etc/nginx/conf.d/default.conf"
  done
  echo "Without it the placeholder is served literally: a CSP source that blocks the API, or a proxy to nowhere."
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

echo "All placeholders in ${env_file} and ${nginx_file} are substituted by ${dockerfile}."
