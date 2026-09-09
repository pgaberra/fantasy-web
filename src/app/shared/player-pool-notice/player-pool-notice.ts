import { Component, computed, input, signal } from '@angular/core';
import { PoolReconciliation } from '../../api/models/pool-reconciliation';
import { IconComponent } from '../icon/icon';

/**
 * Says how many players a projection gained when it was squared with the player pool. The pool
 * moves under a saved projection — a new season brings a new roster, and trades and call-ups
 * follow — and the server adds the newcomers on the read that notices. Rows appearing without a
 * word would read as something having happened to the projection, so it is said out loud once.
 *
 * Players who have *left* the pool are a different matter and not this notice's job: their rows
 * are kept and merely hidden, which the table says for itself since it is the one hiding them.
 *
 * The server reports the addition only on the read that made it, so this shows up once per pool
 * change; dismissing it just takes it off the screen for the rest of the visit.
 */
@Component({
  selector: 'app-player-pool-notice',
  imports: [IconComponent],
  templateUrl: './player-pool-notice.html',
  styleUrl: './player-pool-notice.css',
})
export class PlayerPoolNoticeComponent {
  readonly reconciliation = input<PoolReconciliation | null>(null);

  private readonly dismissed = signal(false);

  protected readonly added = computed(() => this.reconciliation()?.added ?? 0);

  protected readonly show = computed(() => !this.dismissed() && this.added() > 0);

  protected dismiss(): void {
    this.dismissed.set(true);
  }
}
