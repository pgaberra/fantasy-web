import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The two scales the mark is drawn at: beside a label in a button or a tab, and beside the
 * heading of a sync card. A union rather than a free length, for the reason `IconSize` is one —
 * the drawing was copied into four templates and had already picked up two sizes.
 */
export type YahooMarkSize = '0.85rem' | '1.15rem';

/**
 * Yahoo's mark, wherever the app says a league comes from Yahoo.
 *
 * <p>Not an `<app-icon>`: brand marks are their owners' drawings at their owners' colours, and
 * normalising one to the Lucide grid would misdraw somebody's trademark. It is a component all
 * the same, because the alternative — the path copied into every template that names Yahoo — is
 * what the icon set exists to prevent, and it had already reached four copies.
 *
 * <p>Always Yahoo's purple, whatever it sits on (Alexander's rule, 2026-10-11). A button that
 * carries the mark is therefore a light one, `btn-secondary`, the way the Google and Facebook
 * sign-in buttons are white under their owners' colours; the mark is not recoloured to suit a
 * dark button, and the dark button is not recoloured to suit the mark.
 *
 * <p>`check-inline-icons.sh` allows this one template its inline `<svg>`, and no longer allows
 * the templates that used to draw it.
 */
@Component({
  selector: 'app-yahoo-mark',
  templateUrl: './yahoo-mark.html',
  styleUrl: './yahoo-mark.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YahooMarkComponent {
  readonly size = input<YahooMarkSize>('0.85rem');
}
