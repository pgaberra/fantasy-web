#!/usr/bin/env bash
#
# A wait shows something moving, so no template may write one by hand.
#
# The tell is a literal ellipsis. "Loading preview..." is what you write when the only shared
# loading component is a 56px spinner in a 60vh box, which fits a blank page and nothing else:
# it cannot go in a button, so 30 waits across 27 templates were typed out as text instead. A
# fixed ellipsis is exactly what a screen that has stopped looks like, and the reader cannot
# tell a slow request from a dead one. Two of them had drifted further still, printing a typed
# ellipsis AND the animated dots, for five or six dots at once.
#
# Nothing failed, no test covered it, and each one was locally reasonable, which is why it kept
# spreading. So the guard is on the character rather than on the behaviour: an ellipsis in
# template text means a pending state somebody drew by hand.
#
# Use <app-loading-indicator variant="inline" label="Loading preview" /> instead, or the bare
# <app-loading-indicator /> where a whole content area is waiting.
set -euo pipefail

# An ellipsis is legitimate in the two places it is not a wait: it marks an input you type into
# and a choice you have not made yet. Both are steady state, and neither is the app working.
exempt_line() {
  grep -qE 'placeholder=|<option' <<<"$1"
}

offenders=()
while IFS= read -r hit; do
  file=${hit%%:*}
  rest=${hit#*:}
  line=${rest%%:*}
  text=${rest#*:}
  [ "$file" = "src/app/shared/loading-indicator/loading-indicator.html" ] && continue
  exempt_line "$text" && continue
  offenders+=("${file}:${line}  $(sed 's/^[[:space:]]*//' <<<"$text" | cut -c1-72)")
done < <(grep -rn --include='*.html' -e '…' -e '\.\.\.' src/app | tr '\\' '/' | sort)

if [ ${#offenders[@]} -gt 0 ]; then
  echo "::error::${#offenders[@]} template line(s) spell out a pending state instead of showing one:"
  for f in "${offenders[@]}"; do
    echo "  ${f}"
  done
  echo
  echo "Replace the text with the shared component, which moves:"
  echo "  <app-loading-indicator variant=\"inline\" label=\"Loading preview\" />   (a status line or a button)"
  echo "  <app-loading-indicator />                                            (a whole content area)"
  echo "The label carries no ellipsis of its own: the dots supply it, and one in the label renders five."
  exit 1
fi

echo "No hand-written pending states: every wait goes through <app-loading-indicator>."
