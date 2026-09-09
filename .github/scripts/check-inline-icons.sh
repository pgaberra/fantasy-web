#!/usr/bin/env bash
#
# Icons come from <app-icon>, never from an <svg> written into a template.
#
# Drawing them one at a time is what made them drift. Before the icon component the app held 61
# inline SVGs carrying six stroke widths (1.6 to 3) and four viewBoxes, mixing three families at
# once: refresh existed in three shapes, the check as two strokes and one filled Heroicons circle,
# the pencil as both a Bootstrap 16-grid drawing and a Lucide 24-grid one. Nothing was broken and
# nothing failed, which is exactly why it accumulated — an off icon looks like a slightly wrong
# screen, not like a bug, and no reviewer diffs stroke widths across 27 files.
#
# So the guard is on the shape of the change rather than on the drawing: a template may not
# contain an <svg> at all. Adding an icon means adding a case to src/app/shared/icon/icon.html on
# the same grid, which is one place to get right and one place to review.
#
# Brand marks are exempt and listed below. They are multi-colour logos at their owners' own
# scales, and normalising one would misdraw somebody's trademark.
set -euo pipefail

# Files allowed to hold an inline <svg>, each for a stated reason.
allowed=(
  "src/app/shared/icon/icon.html"                                                  # the icon set itself
  "src/app/auth/facebook-sign-in-button/facebook-sign-in-button.html"              # Facebook mark
  "src/app/auth/google-sign-in-button/google-sign-in-button.html"                  # Google mark
  "src/app/draft-projection/draft-projection.html"                                 # Yahoo mark
  "src/app/draft-projection/projection-settings-section/league-sync/league-sync.html"              # Yahoo mark
  "src/app/draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync.html"  # Yahoo mark
  "src/app/whos-hot/whos-hot.html"                                                 # Yahoo mark
)

offenders=()
while read -r file; do
  permitted=false
  for a in "${allowed[@]}"; do
    [ "$file" = "$a" ] && permitted=true && break
  done
  $permitted || offenders+=("$file")
done < <(grep -rl --include='*.html' -- '<svg' src/app | tr '\\' '/' | sort)

if [ ${#offenders[@]} -gt 0 ]; then
  echo "::error::${#offenders[@]} template(s) draw an icon inline instead of using <app-icon>:"
  for f in "${offenders[@]}"; do
    echo "  ${f}"
  done
  echo "Add the shape as a case in src/app/shared/icon/icon.html (24x24 grid, no fill, currentColor,"
  echo "stroke width 2, round caps and joins), add its name to IconName, then use <app-icon name=\"…\" />."
  echo "A new brand mark is the one exception: add it to the allowlist in this script, with the reason."
  exit 1
fi

echo "No inline icons: every template draws its icons through <app-icon>."
