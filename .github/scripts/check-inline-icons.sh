#!/usr/bin/env bash
#
# Icons come from <app-icon>, never from something drawn or typed into the app.
#
# An icon can escape the set in two ways, and this catches both:
#
#  1. An <svg> written into a template. Drawn one at a time, these drifted: before the icon
#     component the app held 61 of them, with six stroke widths and three icon families mixed.
#
#  2. A character standing in for an icon: an arrow, a geometric shape, a dingbat, a plus sign
#     in front of a label ("+ Create"), or a multiplication sign alone in a close button
#     (`&times;`), typed into a template, returned from a component as a string, or put in a CSS
#     `content`. These slipped
#     past the first check, sat on the same row as real icons (a typed cross beside a drawn
#     pencil), and are not even guaranteed to exist in the user's font: undo and redo were already
#     drawn rather than typed because their arrows render as empty boxes in several Windows UI
#     fonts.
#
# Comments are ignored, so prose that mentions an arrow is fine. A character that is genuinely
# text rather than an icon goes in the allowlist below, with the reason.
#
# The files are read by one perl process rather than one process each: spawning a few hundred of
# them made a single run take the better part of a minute on Windows.
set -euo pipefail
export LC_ALL=C.UTF-8

in_list() {
  local needle=$1
  shift
  for item in "$@"; do [ "$item" = "$needle" ] && return 0; done
  return 1
}

# Templates allowed an inline <svg>: brand marks only. They are multi-colour logos at their
# owners' own scales, and normalising one would misdraw somebody's trademark.
svg_allowed=(
  "src/app/auth/facebook-sign-in-button/facebook-sign-in-button.html"
  "src/app/auth/google-sign-in-button/google-sign-in-button.html"
  "src/app/draft-projection/draft-projection.html"
  "src/app/draft-projection/projection-settings-section/league-sync/league-sync.html"
  "src/app/draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync.html"
  "src/app/whos-hot/whos-hot.html"
)

# Files allowed an icon-like character, because there it is text.
glyph_allowed=(
  "src/app/admin/admin.html" # coloured status dots in the internal admin page
  "src/app/draft-projection/projection-settings-section/espn-league-sync/espn-league-sync.html" # arrows between browser menu names in written steps
)

svg_offenders=()
while read -r file; do
  in_list "$file" "${svg_allowed[@]}" || svg_offenders+=("$file")
done < <(grep -rl --include='*.html' -- '<svg' src/app | sort)

# Arrows (U+2190-21FF), geometric shapes (U+25A0-25FF) and dingbats (U+2700-27BF), looked for in
# what each kind of file actually shows: a template without its comments, a component without its
# comment lines, and only the `content` values of a stylesheet.
glyph_offenders=()
while read -r file; do
  in_list "$file" "${glyph_allowed[@]}" || glyph_offenders+=("$file")
done < <(
  find src/app src/styles.css \( -name '*.html' -o -name '*.css' -o \( -name '*.ts' ! -name '*.spec.ts' \) \) |
    sort |
    perl -CSD -ne '
      chomp(my $file = $_);
      open(my $fh, "<:encoding(UTF-8)", $file) or die "$file: $!";
      my $text = do { local $/; <$fh> };
      close $fh;
      if ($file =~ /\.html$/) {
        $text =~ s/<!--.*?-->//gs;
      } elsif ($file =~ /\.ts$/) {
        $text = join "", grep { !/^\s*(\*|\/\/|\/\*)/ } split /^/m, $text;
      } else {
        $text = join "\n", $text =~ /content:\s*([^;]*);/g;
      }
      # The plus is only an icon where it leads a label: first in an element, or first in a
      # string. Arithmetic and string concatenation (`" + name`) have a space before the plus.
      # The multiplication sign is only an icon where it is the whole of an element, as in a close
      # button; a multiplier such as `×1.5` has its number beside it.
      print "$file\n" if $text =~ /[\x{2190}-\x{21FF}\x{25A0}-\x{25FF}\x{2700}-\x{27BF}]/
        || $text =~ />\s*\+\s+\p{L}|[\x22\x27\x60]\+\s+\p{L}/
        || $text =~ />\s*(?:&times;|\x{00D7})\s*</;
    '
)

status=0
if [ ${#svg_offenders[@]} -gt 0 ]; then
  echo "::error::${#svg_offenders[@]} template(s) draw an icon inline instead of using <app-icon>:"
  printf '  %s\n' "${svg_offenders[@]}"
  status=1
fi
if [ ${#glyph_offenders[@]} -gt 0 ]; then
  echo "::error::${#glyph_offenders[@]} file(s) type a character where an icon belongs:"
  printf '  %s\n' "${glyph_offenders[@]}"
  status=1
fi
if [ $status -ne 0 ]; then
  echo "Use <app-icon name=\"…\" />. A name that is not in the set yet is one import from"
  echo "@ng-icons/lucide in src/app/shared/icon/icon.ts. If the character is genuinely text there,"
  echo "add the file to the matching allowlist in this script with the reason."
  exit 1
fi

echo "No inline icons: every icon comes from <app-icon>, drawn or typed nowhere else."
