import { Component, inject, input, output } from '@angular/core';
import { OpenPopovers } from '../../shared/popover/open-popovers';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

/**
 * Blocking warning shown when the user changes something that came from a synced league.
 * They can re-sync the league (pull its latest settings) or confirm and break the sync.
 *
 * <p>Draft Mode asks before the change rather than after it, and has nothing to re-sync: its
 * picks are the league's draft as it stands. There the warning is a plain question, go on or
 * don't, and the wording names the draft and what is about to change.
 */
@Component({
  selector: 'app-sync-warning-dialog',
  imports: [TooltipDirective, IconComponent, LoadingIndicatorComponent],
  templateUrl: './sync-warning-dialog.html',
  styleUrl: './sync-warning-dialog.css',
})
export class SyncWarningDialogComponent {
  /**
   * The edit that raises this warning is usually made inside a menu — a column's stats, the
   * league setup — and that menu has no reason of its own to close, so it would hang over the
   * dialog it just raised.
   */
  constructor() {
    inject(OpenPopovers).closeAll();
  }

  readonly leagueName = input.required<string>();
  /** Named so the advice points at the site the user would go and change the league in. */
  readonly platform = input.required<string>();
  /** What loses its league: "this projection", "this draft". */
  readonly subject = input<string>('projection');
  /** What the user is changing, as the sentence names it. */
  readonly change = input<string>('this setting');
  /** Whether re-syncing the league is on offer; without it the second button just cancels. */
  readonly reSyncOffered = input<boolean>(true);
  /** What the cross and Escape do, said on the cross: undo the edit, or not make it. */
  readonly cancelLabel = input<string>('Undo my change and stay in sync');
  readonly confirmLabel = input<string>('Keep my change');
  readonly reSyncing = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly reSync = output<void>();
  readonly confirm = output<void>();
  /** The cross, Escape and a Cancel button: put the edit back, or leave it unmade, and keep the league. */
  readonly cancelled = output<void>();
}
