#!/usr/bin/env bash
#
# Only the account's own sign-in, sign-up and reset pages (src/app/auth/) may use a password field.
#
# A browser's password manager reads any `type="password"` input as a login form, whatever its
# `autocomplete` says, and takes the text field before it for the username. The ESPN cookie
# fields were password inputs, and Chrome filled the saved SlapStat sign-in into them: the email
# into League ID, the password into espn_s2, which a sync would then have stored as an ESPN
# cookie. Anything else that is secret but is not the SlapStat password (a pasted cookie, a key)
# goes in `<input appCookieField>`, a masked text field no password manager claims.
#
# Templates are read in .html files and in the inline `template:` of a .ts file; a comment line
# in a .ts file (one starting `*` or `//`) is prose, not markup, and is left alone.
set -euo pipefail

offenders=()
while IFS= read -r hit; do
  offenders+=("$hit")
done < <(grep -rnE "type=[\"']password[\"']|\[(attr\.)?type\]=" src/app --include='*.html' --include='*.ts' \
  | grep -v '^src/app/auth/' \
  | grep -v '\.spec\.ts:' \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(\*|//)' || true)

if [ ${#offenders[@]} -gt 0 ]; then
  echo "::error::${#offenders[@]} password field(s) outside src/app/auth/:"
  for f in "${offenders[@]}"; do
    echo "  ${f}"
  done
  echo
  echo "A password manager fills these with the SlapStat sign-in. For a secret that is not the"
  echo "account's password, use the masked text field instead (import CookieFieldDirective):"
  echo "  <input appCookieField [value]=\"…\" (input)=\"…\" />"
  exit 1
fi

echo "No password fields outside the sign-in pages."
