import { Component, inject, output } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { OpenPopovers } from '../../shared/popover/open-popovers';

/**
 * Importing a league is a short flow with real consequences — it overwrites the scoring type,
 * the active columns and the roster slots. It gets a focused dialog rather than an inline panel
 * so those consequences aren't buried under the table the user is reading.
 */
@Component({
  selector: 'app-league-sync-dialog',
  imports: [IconComponent],
  templateUrl: './league-sync-dialog.html',
  styleUrl: './league-sync-dialog.css',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class LeagueSyncDialogComponent {
  /**
   * The League setup menu opens this ("Re-sync, change or disconnect") and has no reason of its
   * own to close, so it would hang over the dialog, as the sync warning's menus would over it.
   */
  constructor() {
    inject(OpenPopovers).closeAll();
  }

  readonly closed = output<void>();
}
