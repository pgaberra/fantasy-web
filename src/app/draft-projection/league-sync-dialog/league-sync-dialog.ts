import { Component, output } from '@angular/core';

/**
 * Importing a league is a short flow with real consequences — it overwrites the scoring type,
 * the active columns and the roster slots. It gets a focused dialog rather than an inline panel
 * so those consequences aren't buried under the table the user is reading.
 */
@Component({
  selector: 'app-league-sync-dialog',
  templateUrl: './league-sync-dialog.html',
  styleUrl: './league-sync-dialog.css',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class LeagueSyncDialogComponent {
  readonly closed = output<void>();
}
