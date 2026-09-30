import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';

/**
 * The one statement of the league the settings are held to: the toolbar chip's green dot, the
 * league's name, when it was last synced and, where the link is the host's to drop, Disconnect.
 * Every synced line is this component — the Yahoo card's, the ESPN card's, and the wrapper's own
 * line for a platform with no tab on offer — so the link reads the same wherever it is stated.
 *
 * The text and the button are grid columns rather than a wrapping flex row: the text wraps within
 * its own column and the button keeps the end of the line, instead of dropping alone onto a line
 * of its own whenever a name and a date outgrow the width — which in the 520px import dialog was
 * every time.
 */
@Component({
  selector: 'app-synced-line',
  imports: [DatePipe],
  templateUrl: './synced-line.html',
  styleUrl: './synced-line.css',
})
export class SyncedLineComponent {
  /** Null where the platform gave the league no name: the line then says only that it is synced. */
  readonly leagueName = input<string | null>(null);
  readonly syncedAt = input<string | null>(null);
  /** The link is the host's to drop, so the line carries the way out. */
  readonly disconnectable = input(false);
  readonly disconnected = output<void>();

  /** A no-break space before AM/PM: a phone-width column otherwise leaves "PM" on a line alone. */
  protected readonly dateFormat = 'MMM d, y, h:mm a';
}
