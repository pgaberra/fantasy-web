import { computed, inject, Injectable } from '@angular/core';
import { EntitlementService } from '../../services/entitlement.service';
import { environment } from '../../../environments/environment';

/**
 * Whether this account still has to buy the AI projection.
 *
 * <p>One answer for the two pages that offer it — the draft picker and the new-projection page —
 * so they cannot drift into locking the same starting point on different terms. The BFF refuses
 * a model-seeded board and the model's own lines to the same accounts; this is only what the
 * pages draw, and it is deliberately not a security boundary.
 *
 * <p>Locked is not the same as hidden. The card stays on both pages, marked and sold: someone
 * who cannot see the thing has no reason to pay for it. `FeatureService.aiProjection` is what
 * genuinely hides it, and it is a different question: an environment that does not serve the
 * model has nothing to sell either.
 */
@Injectable({ providedIn: 'root' })
export class AiProjectionAccess {
  private readonly entitlement = inject(EntitlementService);

  /**
   * The entitlement is a live read and says non-premium until it lands, so acting on it early
   * would put a lock on a subscriber's own feature for the length of a request. Nothing is
   * locked until the answer is in. A read that failed counts as in: we do not know, the server
   * will refuse anyway, and the pitch is a better thing to meet than an unexplained refusal.
   */
  private readonly settled = computed(
    () => this.entitlement.loadState() === 'loaded' || this.entitlement.loadState() === 'error',
  );

  readonly locked = computed(
    () => environment.paymentsEnabled && !this.entitlement.premium() && this.settled(),
  );
}
