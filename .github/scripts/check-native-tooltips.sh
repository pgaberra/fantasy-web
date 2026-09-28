#!/usr/bin/env bash
#
# Every tooltip goes through [appTooltip], so no template may set a native `title`.
#
# The browser's own title bubble is grey, late (about a second), unstyled and never shown on a
# phone, and it sat beside the app's own tooltip for a year: the projection card's cut-off name
# and the draft picker's rows used it while the buttons next to them used appTooltip, so the same
# page drew two kinds of tooltip. Each one was locally reasonable, which is how it spread.
#
# `title` is also an input on some of our own components (<app-error-state title="…">,
# <app-auth-form title="…">). Those are not the attribute, so a title on an element whose tag
# starts with `app-` is left alone. The tag is tracked across lines, since a long element puts
# each attribute on a line of its own.
set -euo pipefail

offenders=()
while IFS= read -r file; do
  while IFS= read -r hit; do
    offenders+=("$hit")
  done < <(awk -v file="$file" '
    {
      line = $0
      # Remember the last tag opened on or before this line.
      while (match(line, /<[a-zA-Z][a-zA-Z0-9-]*/)) {
        tag = substr(line, RSTART + 1, RLENGTH - 1)
        line = substr(line, RSTART + RLENGTH)
      }
      if (tag ~ /^app-/) next
      if ($0 ~ /(^|[[:space:]])(title|\[title\]|\[attr\.title\])=/) {
        text = $0
        sub(/^[[:space:]]+/, "", text)
        print file ":" FNR "  " substr(text, 1, 72)
      }
    }' "$file")
done < <(find src/app -name '*.html' | sort)

if [ ${#offenders[@]} -gt 0 ]; then
  echo "::error::${#offenders[@]} template line(s) use the browser's native title tooltip:"
  for f in "${offenders[@]}"; do
    echo "  ${f}"
  done
  echo
  echo "Use the app's own tooltip instead (import TooltipDirective):"
  echo "  appTooltip=\"Back-to-backs\"      [appTooltip]=\"projection.name\""
  exit 1
fi

echo "No native title tooltips: every tooltip goes through appTooltip."
