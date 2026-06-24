import { Component, input, output } from '@angular/core';

/**
 * Blocking warning shown when the user changes a setting that is synced from a Yahoo league.
 * They can re-sync the league (pull its latest settings) or confirm and break the sync.
 */
@Component({
  selector: 'app-sync-warning-dialog',
  templateUrl: './sync-warning-dialog.html',
  styleUrl: './sync-warning-dialog.css',
})
export class SyncWarningDialogComponent {
  readonly leagueName = input.required<string>();
  readonly reSyncing = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly reSync = output<void>();
  readonly confirm = output<void>();
}
