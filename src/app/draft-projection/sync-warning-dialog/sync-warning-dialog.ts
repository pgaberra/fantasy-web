import { Component, inject, input, output } from '@angular/core';
import { OpenPopovers } from '../../shared/popover/open-popovers';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { IconComponent } from '../../shared/icon/icon';

/**
 * Blocking question asked before a change that would take a draft out of its league's draft: a
 * pick changed by hand, or a board's order changed in its settings. Go on or don't; the wording
 * names the draft and what is about to change.
 *
 * <p>League settings never raise it. They are locked to the league they were imported from, on
 * every page, until the user disconnects it, so there is nothing to drift.
 */
@Component({
  selector: 'app-sync-warning-dialog',
  imports: [TooltipDirective, IconComponent],
  templateUrl: './sync-warning-dialog.html',
  styleUrl: './sync-warning-dialog.css',
})
export class SyncWarningDialogComponent {
  /**
   * The change that raises this warning may be made inside a menu, and that menu has no reason of
   * its own to close, so it would hang over the dialog it just raised.
   */
  constructor() {
    inject(OpenPopovers).closeAll();
  }

  readonly leagueName = input.required<string>();
  /** What loses its league: "this draft". */
  readonly subject = input<string>('draft');
  /** What the user is changing, as the sentence names it. */
  readonly change = input.required<string>();
  /** What the cross and Escape do, said on the cross: leave the change unmade. */
  readonly cancelLabel = input.required<string>();
  readonly confirmLabel = input.required<string>();

  readonly confirm = output<void>();
  /** The cross, Escape and Cancel: leave the change unmade, and keep the league. */
  readonly cancelled = output<void>();
}
