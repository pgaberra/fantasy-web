import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Every icon name the app can draw. A runtime array rather than a bare union so the spec can walk
 * it: a name added here but never given a `@case` in `icon.html` would otherwise compile, render
 * nothing, and leave an empty gap on a screen that nobody diffs.
 */
export const ICON_NAMES = [
  'alert-triangle',
  'arrow-up-to-line',
  'chart-bar',
  'chart-columns',
  'check',
  'check-circle',
  'chevron-down',
  'chevron-right',
  'clipboard-list',
  'close',
  'columns',
  'grip-vertical',
  'info',
  'link',
  'lock',
  'menu',
  'more-vertical',
  'pencil',
  'play',
  'redo',
  'refresh',
  'rotate-ccw',
  'share',
  'sliders',
  'sparkles',
  'table',
  'trash',
  'undo',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Every icon in the app, drawn to one spec: a 24x24 grid, `currentColor`, no fill, stroke width
 * 2, round caps and joins. That is the Feather/Lucide convention the app's icons were already
 * reaching for by hand, and drawing them one at a time is what made them drift: before this
 * component the 61 inline SVGs carried six stroke widths (1.6 through 3), four viewBoxes, and
 * three families at once, with refresh drawn three different ways and the check drawn as a
 * stroke twice and a filled Heroicons circle once.
 *
 * The stroke lives on the `<svg>`, so it scales with `size` and an icon keeps the same relative
 * weight at 12px as at 20px. Nothing about an icon is settable from a call site except its size:
 * an icon that needs its own weight or its own grid is a sign the shape is wrong, not the spec.
 *
 * Colour comes from the surrounding text, so an icon inherits state (disabled, hover, danger)
 * without knowing about it. Icons are `aria-hidden`: they never carry the accessible name, which
 * belongs on the button or link they sit in.
 *
 * Brand marks (Yahoo, Google, Facebook) are deliberately NOT here. They are multi-colour logos
 * with fixed fills at their own scale, and normalising them would misdraw someone's trademark.
 * `.github/scripts/check-inline-icons.sh` allows those files an inline `<svg>` and no others.
 */
@Component({
  selector: 'app-icon',
  templateUrl: './icon.html',
  styleUrl: './icon.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  /** Edge length in pixels. The scale is 14 (inline with text), 16 (default) and 20 (standalone). */
  readonly size = input(16);
}
