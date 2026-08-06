import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { checkoutSession } from '../api/fn/billing/checkout-session';
import { portalSession } from '../api/fn/billing/portal-session';
import { entitlements } from '../api/fn/billing/entitlements';
import { CheckoutUrlResponse, EntitlementsResponse, PortalUrlResponse } from '../api/models';

/**
 * Thin wrapper over the BFF billing endpoints. Checkout and portal return a provider-hosted URL
 * the caller redirects the browser to (`window.location.href = …`); entitlements is a live read
 * of the current premium status.
 */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly api = inject(Api);

  startCheckout(): Observable<CheckoutUrlResponse> {
    return from(this.api.invoke(checkoutSession));
  }

  openPortal(): Observable<PortalUrlResponse> {
    return from(this.api.invoke(portalSession));
  }

  getEntitlements(): Observable<EntitlementsResponse> {
    return from(this.api.invoke(entitlements));
  }
}
