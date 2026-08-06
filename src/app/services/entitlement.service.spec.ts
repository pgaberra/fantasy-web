import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntitlementService } from './entitlement.service';
import { BillingService } from './billing.service';

const getEntitlements = vi.fn();

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(async () => {
    getEntitlements.mockReset();
    await MockBuilder(EntitlementService).mock(BillingService, { getEntitlements });
    service = TestBed.inject(EntitlementService);
  });

  it('applies a premium entitlement on refresh', () => {
    getEntitlements.mockReturnValue(
      of({
        premium: true,
        status: 'active',
        currentPeriodEnd: '2027-01-01T00:00:00Z',
        cancelAtPeriodEnd: false,
      }),
    );

    service.refresh();

    expect(service.premium()).toEqual(true);
    expect(service.status()).toEqual('active');
    expect(service.currentPeriodEnd()).toEqual('2027-01-01T00:00:00Z');
    expect(service.loadState()).toEqual('loaded');
  });

  it('falls back to non-premium when the read fails', () => {
    service.premium.set(true);
    getEntitlements.mockReturnValue(throwError(() => new Error('boom')));

    service.refresh();

    expect(service.premium()).toEqual(false);
    expect(service.status()).toEqual('none');
    expect(service.loadState()).toEqual('error');
  });
});
