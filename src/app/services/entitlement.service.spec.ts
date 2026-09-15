import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntitlementService } from './entitlement.service';
import { AuthService } from './auth.service';
import { BillingService } from './billing.service';
import { environment } from '../../environments/environment';

const getEntitlements = vi.fn();
const isLoggedIn = signal(false);

const PREMIUM = {
  premium: true,
  status: 'active',
  currentPeriodEnd: '2027-01-01T00:00:00Z',
  cancelAtPeriodEnd: false,
};

describe('EntitlementService', () => {
  let service: EntitlementService;
  const originalPaymentsEnabled = environment.paymentsEnabled;

  beforeEach(async () => {
    getEntitlements.mockReset();
    getEntitlements.mockReturnValue(of(PREMIUM));
    isLoggedIn.set(false);
    await MockBuilder(EntitlementService)
      .mock(BillingService, { getEntitlements })
      .mock(AuthService, { isLoggedIn });
    service = TestBed.inject(EntitlementService);
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPaymentsEnabled;
  });

  it('applies a premium entitlement on refresh', () => {
    isLoggedIn.set(true);

    service.refresh();

    expect(service.premium()).toEqual(true);
    expect(service.status()).toEqual('active');
    expect(service.currentPeriodEnd()).toEqual('2027-01-01T00:00:00Z');
    expect(service.loadState()).toEqual('loaded');
  });

  it('falls back to non-premium when the read fails', () => {
    isLoggedIn.set(true);
    service.premium.set(true);
    getEntitlements.mockReturnValue(throwError(() => new Error('boom')));

    service.refresh();

    expect(service.premium()).toEqual(false);
    expect(service.status()).toEqual('none');
    expect(service.loadState()).toEqual('error');
  });

  /**
   * The plan belongs to an account, so a read without one can only be refused: the Premium page
   * asked on every signed-out visit, and each visit logged a 401 in the browser console. It is also
   * what a page prerendered at build time would ask, where nobody is ever signed in.
   */
  it('asks nothing, and stays idle, for a signed-out visitor', () => {
    service.refresh();

    expect(getEntitlements).not.toHaveBeenCalled();
    expect(service.premium()).toEqual(false);
    expect(service.loadState()).toEqual('idle');
  });

  /**
   * Signing in is a router navigation, not a reload, so a load that happened once at bootstrap
   * missed everyone who signed in during the session: a subscriber arriving through the login
   * page was treated as free until they reloaded. The entitlement has to follow the session.
   */
  describe('following the session', () => {
    it('loads the entitlement when a session starts', () => {
      environment.paymentsEnabled = true;

      isLoggedIn.set(true);
      TestBed.tick();

      expect(getEntitlements).toHaveBeenCalledOnce();
      expect(service.premium()).toEqual(true);
      expect(service.loadState()).toEqual('loaded');
    });

    // The next account to sign in on this browser must not inherit the last one's plan.
    it('forgets the entitlement when the session ends', () => {
      environment.paymentsEnabled = true;
      isLoggedIn.set(true);
      TestBed.tick();

      isLoggedIn.set(false);
      TestBed.tick();

      expect(service.premium()).toEqual(false);
      expect(service.status()).toEqual('none');
      expect(service.loadState()).toEqual('idle');
    });

    it('fetches nothing where payments are off, since nothing is for sale', () => {
      environment.paymentsEnabled = false;

      isLoggedIn.set(true);
      TestBed.tick();

      expect(getEntitlements).not.toHaveBeenCalled();
      expect(service.loadState()).toEqual('idle');
    });
  });
});
