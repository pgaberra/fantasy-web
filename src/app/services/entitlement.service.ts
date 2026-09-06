import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { BillingService } from './billing.service';
import { EntitlementsResponse } from '../api/models';
import { environment } from '../../environments/environment';

/**
 * Live premium-entitlement store. Holds the current entitlement as signals so guards, the nav and
 * any premium feature can read it reactively. It is a *live* read (not a JWT claim) because a
 * subscription webhook can flip `premium` asynchronously mid-session; call {@link refresh} after
 * returning from checkout or the portal. Any failure falls back to the safe non-premium default,
 * so a transient error never leaves a stale "premium" unlocked.
 *
 * It **follows the session**, the way `AccountService` does: an effect on `AuthService.isLoggedIn`
 * loads the entitlement when a session starts and drops it when one ends. It used to load once at
 * bootstrap instead, which missed anyone who signed in *during* the session (sign-in is a router
 * navigation, not a reload), so a subscriber arriving through the login page was treated as free
 * until they reloaded the page, and Who's hot snapped their stored range back to the free one.
 * Only where payments exist: without them nothing is entitled and there is nothing to fetch.
 */
@Injectable({ providedIn: 'root' })
export class EntitlementService {
  private readonly auth = inject(AuthService);
  private readonly billing = inject(BillingService);

  readonly premium = signal<boolean>(false);
  readonly status = signal<string>('none');
  readonly currentPeriodEnd = signal<string | null>(null);
  readonly cancelAtPeriodEnd = signal<boolean>(false);
  readonly loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  constructor() {
    effect(() => {
      const signedIn = this.auth.isLoggedIn();
      untracked(() => {
        if (!environment.paymentsEnabled) {
          return;
        }
        if (signedIn) {
          this.refresh();
        } else {
          this.forget();
        }
      });
    });
  }

  refresh(): void {
    this.loadState.set('loading');
    this.billing.getEntitlements().subscribe({
      next: (entitlement) => {
        this.apply(entitlement);
        this.loadState.set('loaded');
      },
      error: () => {
        this.reset();
        this.loadState.set('error');
      },
    });
  }

  private apply(entitlement: EntitlementsResponse): void {
    this.premium.set(entitlement.premium);
    this.status.set(entitlement.status);
    this.currentPeriodEnd.set(entitlement.currentPeriodEnd ?? null);
    this.cancelAtPeriodEnd.set(entitlement.cancelAtPeriodEnd);
  }

  /** Back to knowing nothing, so the next account to sign in never inherits the last one's plan. */
  private forget(): void {
    this.reset();
    this.loadState.set('idle');
  }

  private reset(): void {
    this.premium.set(false);
    this.status.set('none');
    this.currentPeriodEnd.set(null);
    this.cancelAtPeriodEnd.set(false);
  }
}
