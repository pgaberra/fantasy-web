import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { Api } from '../api/api';
import { checkoutSession } from '../api/fn/billing/checkout-session';
import { portalSession } from '../api/fn/billing/portal-session';
import { entitlements } from '../api/fn/billing/entitlements';

const invoke = vi.fn();

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    invoke.mockReset();
    await MockBuilder(BillingService).provide({ provide: Api, useValue: { invoke } });
    service = TestBed.inject(BillingService);
  });

  it('starts a checkout session', async () => {
    invoke.mockResolvedValue({ checkoutUrl: 'https://checkout.example/abc' });

    const result = await firstValueFrom(service.startCheckout());

    expect(invoke).toHaveBeenCalledWith(checkoutSession);
    expect(result.checkoutUrl).toEqual('https://checkout.example/abc');
  });

  it('opens the billing portal', async () => {
    invoke.mockResolvedValue({ portalUrl: 'https://portal.example/xyz' });

    const result = await firstValueFrom(service.openPortal());

    expect(invoke).toHaveBeenCalledWith(portalSession);
    expect(result.portalUrl).toEqual('https://portal.example/xyz');
  });

  it('reads the current entitlement', async () => {
    invoke.mockResolvedValue({ premium: true, status: 'active', cancelAtPeriodEnd: false });

    const result = await firstValueFrom(service.getEntitlements());

    expect(invoke).toHaveBeenCalledWith(entitlements);
    expect(result.premium).toEqual(true);
  });
});
