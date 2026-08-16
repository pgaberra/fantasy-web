import { Component, computed, input, signal } from '@angular/core';
import { PoolReconciliation } from '../../api/models/pool-reconciliation';

/**
 * Says what changed when a projection was squared with the player pool. The pool moves under a
 * saved projection — a new season brings a new roster, and trades and call-ups follow — and the
 * server reconciles the rows on the read that notices. Rows appearing and disappearing without a
 * word would read as the projection having lost work, so it is said out loud once.
 *
 * The server reports the change only on the read that made it, so this shows up once per pool
 * change; dismissing it just takes it off the screen for the rest of the visit.
 */
@Component({
  selector: 'app-player-pool-notice',
  templateUrl: './player-pool-notice.html',
  styleUrl: './player-pool-notice.css',
})
export class PlayerPoolNoticeComponent {
  readonly reconciliation = input<PoolReconciliation | null>(null);

  private readonly dismissed = signal(false);

  protected readonly show = computed(() => {
    const change = this.reconciliation();
    return !this.dismissed() && !!change && change.added + change.removed > 0;
  });

  protected readonly added = computed(() => this.reconciliation()?.added ?? 0);
  protected readonly removed = computed(() => this.reconciliation()?.removed ?? 0);

  protected dismiss(): void {
    this.dismissed.set(true);
  }
}
