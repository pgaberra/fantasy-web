#!/usr/bin/env bash
#
# Every __PLACEHOLDER__ in environment.prod.ts must be substituted by the Dockerfile.
#
# The two files are edited separately and nothing connects them, so it is easy to add a flag
# to the environment and forget its sed line. Nothing then fails: the build succeeds, the
# placeholder survives into the bundle, and the guard that reads it (`startsWith('__X')`)
# quietly resolves the value to empty. The feature is simply off in the deployed app, with no
# error anywhere. That is exactly how the pricing page shipped without a price.
#
# Checks only that a substitution exists, not that a value was supplied — an intentionally
# empty build arg is a deployment choice, a missing sed line is a bug.
set -euo pipefail

env_file=src/environments/environment.prod.ts
dockerfile=Dockerfile

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
  exit 1
fi

echo "All placeholders in ${env_file} are substituted by ${dockerfile}."
