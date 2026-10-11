#!/usr/bin/env bash
#
# A dialog closes on its cross, its Cancel button or Escape — never on a click beside it.
#
# Eight dialogs closed when the backdrop was clicked, three did not: each was copied from the one
# before it. A click that misses the card by a pixel, or a text selection dragged past its edge,
# threw away a typed league id, pasted cookies or a placed crop, with no way back. So no element
# whose class names a backdrop or an overlay may listen for a click. The opening tag is read as a
# whole, since a long one puts each attribute on a line of its own.
set -euo pipefail

offenders=()
while IFS= read -r file; do
  while IFS= read -r hit; do
    offenders+=("$hit")
  done < <(awk -v file="$file" '
    function check(tag, line) {
      if (tag ~ /class="[^"]*(backdrop|overlay)[^"]*"/ && tag ~ /\((click|mousedown|pointerdown)\)=/) {
        print file ":" line
      }
    }
    {
      rest = $0
      while (rest != "") {
        if (open) {
          end = index(rest, ">")
          if (end == 0) { tag = tag " " rest; rest = "" }
          else { tag = tag " " substr(rest, 1, end); check(tag, start); open = 0; rest = substr(rest, end + 1) }
        } else if (match(rest, /<[a-zA-Z][a-zA-Z0-9-]*/)) {
          open = 1; tag = ""; start = FNR; rest = substr(rest, RSTART)
        } else {
          rest = ""
        }
      }
    }' "$file")
done < <(find src/app -name '*.html' | sort)

if [ ${#offenders[@]} -gt 0 ]; then
  echo "::error::${#offenders[@]} dialog backdrop(s) close on a click beside the dialog:"
  for f in "${offenders[@]}"; do
    echo "  ${f}"
  done
  echo
  echo "Close a dialog from its cross, a Cancel button or Escape, not from the backdrop."
  exit 1
fi

echo "No backdrop closes its dialog on a click."
