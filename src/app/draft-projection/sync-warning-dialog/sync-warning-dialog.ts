import { Component, input, output } from '@angular/core';

/**
 * Blocking warning shown when the user changes a setting that came from a synced league.
 * They can re-sync the league (pull its latest settings) or confirm and break the sync.
 */
@Component({
  selector: 'app-sync-warning-dialog',
  templateUrl: './sync-warning-dialog.html',
  styleUrl: './sync-warning-dialog.css',
})
export class SyncWarningDialogComponent {
  readonly leagueName = input.required<string>();
  /** Named so the advice points at the site the user would go and change the league in. */
  readonly platform = input.required<string>();
  readonly reSyncing = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly reSync = output<void>();
  readonly confirm = output<void>();
}
