import { inject, Injectable, signal } from '@angular/core';
import { BillingService } from './billing.service';
import { EntitlementsResponse } from '../api/models';

/**
 * Live premium-entitlement store. Holds the current entitlement as signals so guards, the nav and
 * any future premium feature can read it reactively. It is a *live* read (not a JWT claim) because
 * a subscription webhook can flip `premium` asynchronously mid-session; call {@link refresh} on app
 * init and again after returning from checkout/the portal. Any failure falls back to the safe
 * non-premium default, so a transient error never leaves a stale "premium" unlocked.
 */
@Injectable({ providedIn: 'root' })
export class EntitlementService {
  private readonly billing = inject(BillingService);

  readonly premium = signal<boolean>(false);
  readonly status = signal<string>('none');
  readonly currentPeriodEnd = signal<string | null>(null);
  readonly cancelAtPeriodEnd = signal<boolean>(false);
  readonly loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');

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

  private reset(): void {
    this.premium.set(false);
    this.status.set('none');
    this.currentPeriodEnd.set(null);
    this.cancelAtPeriodEnd.set(false);
  }
}
