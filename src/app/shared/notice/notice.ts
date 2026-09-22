import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon';

/** How loud a notice is, and which of the palette's token triples draws it. */
export type NoticeTone = 'info' | 'warning' | 'error';

/**
 * Whether the notice is a panel of its own (`boxed`) or a line in the flow of the page
 * (`inline`). The tone is the same either way; only the wash and the edge belong to the box.
 */
export type NoticeVariant = 'boxed' | 'inline';

/** What each tone reaches for when a caller names no icon. */
const TONE_ICONS: Record<NoticeTone, IconName> = {
  info: 'info',
  warning: 'alert-triangle',
  error: 'alert-triangle',
};

/**
 * The app's one notice: something the page has to say beside the thing the reader came for.
 *
 * <p>It exists because the four notices already shipped were drawn four different ways — a
 * surface card with a gold left accent (the off-season banner), a warning wash with a soft edge
 * (a projection changed under you), a full-bleed bar (verify your email) and a line of red text
 * with a triangle (this league has no draft). Four treatments is not a vocabulary: a reader
 * cannot learn that one of them means "worse than the others" when each appears once.
 *
 * <p>Three tones, each a triple already in the palette, so nothing new is invented:
 * <ul>
 *   <li>{@code info} — the neutral card: something is worth knowing.</li>
 *   <li>{@code warning} — the gold wash `--color-warning-*`, which `styles.css` calls "the quiet
 *       notice": something is not as the reader would assume.</li>
 *   <li>{@code error} — the red wash: the thing the reader came for is not coming.</li>
 * </ul>
 *
 * <p>The icon is the tone's by default and settable, because an icon often says what the
 * message is *about* where the colour says how loud it is — the off-season notice is a warning
 * drawn with an `info` glyph. `showIcon` turns it off for a notice that reads as prose.
 *
 * <p>`role` is the caller's: `status` for something the reader may notice in passing, `alert`
 * for a dead end, `note` for standing context. It is not derived from the tone, because how
 * loud a thing looks and whether a screen reader should interrupt for it are different
 * questions — a warning that has sat on the page since it loaded is not an alert.
 */
@Component({
  selector: 'app-notice',
  imports: [IconComponent],
  templateUrl: './notice.html',
  styleUrl: './notice.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'notice',
    '[class.notice--info]': "tone() === 'info'",
    '[class.notice--warning]': "tone() === 'warning'",
    '[class.notice--error]': "tone() === 'error'",
    '[class.notice--boxed]': "variant() === 'boxed'",
    '[class.notice--inline]': "variant() === 'inline'",
    '[attr.role]': 'role()',
  },
})
export class NoticeComponent {
  readonly tone = input<NoticeTone>('info');
  readonly variant = input<NoticeVariant>('boxed');

  /** Overrides the tone's own glyph. Null takes it. */
  readonly icon = input<IconName | null>(null);

  /** False for a notice that reads as a sentence and would only be interrupted by a glyph. */
  readonly showIcon = input(true);

  readonly role = input<'status' | 'alert' | 'note'>('status');

  protected readonly shownIcon = computed(() => this.icon() ?? TONE_ICONS[this.tone()]);

  /** 16 in a box, where the icon sits beside a block; 14 on a line, where it sits in text. */
  protected readonly iconSize = computed(() => (this.variant() === 'boxed' ? 16 : 14));
}
