import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiProjectionAccess } from './ai-projection-access';
import { EntitlementService } from '../../services/entitlement.service';
import { environment } from '../../../environments/environment';

describe('AiProjectionAccess', () => {
  const premium = signal(false);
  const loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded');
  const originalPaymentsEnabled = environment.paymentsEnabled;
  let access: AiProjectionAccess;

  beforeEach(async () => {
    premium.set(false);
    loadState.set('loaded');
    environment.paymentsEnabled = true;
    await MockBuilder(AiProjectionAccess).mock(EntitlementService, { premium, loadState });
    access = TestBed.inject(AiProjectionAccess);
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPaymentsEnabled;
  });

  it('locks the AI projection for an account without a subscription', () => {
    expect(access.locked()).toBe(true);
  });

  it('leaves it open to a subscriber', () => {
    premium.set(true);

    expect(access.locked()).toBe(false);
  });

  /**
   * Where premium is not sold the AI projection is free, and the BFF agrees: it checks
   * `payments.enabled` before it checks anyone's subscription. A lock here would be a door
   * with no handle, since the Premium page redirects home in that build.
   */
  it('locks nothing where there is no way to buy anything', () => {
    environment.paymentsEnabled = false;

    expect(access.locked()).toBe(false);
  });

  /**
   * The entitlement is a live read that says non-premium until it lands. Locking on that would
   * put a padlock on a subscriber's own feature for the length of a request, every time they
   * open the page.
   */
  it('waits for the entitlement before locking anything', () => {
    loadState.set('loading');

    expect(access.locked()).toBe(false);

    loadState.set('loaded');

    expect(access.locked()).toBe(true);
  });

  /**
   * A read that failed is settled: we do not know, the server will refuse anyway, and the
   * pitch is a better thing to meet than a refusal with no explanation attached.
   */
  it('treats a failed read as settled, so the pitch shows rather than a later refusal', () => {
    loadState.set('error');

    expect(access.locked()).toBe(true);
  });

  describe('readsWholeBoard', () => {
    it('is true for a subscriber', () => {
      premium.set(true);

      expect(access.readsWholeBoard()).toBe(true);
    });

    it('is true where nothing is sold, as the BFF serves the board to everyone there', () => {
      environment.paymentsEnabled = false;

      expect(access.readsWholeBoard()).toBe(true);
    });

    it('is false for an account without a subscription', () => {
      expect(access.readsWholeBoard()).toBe(false);
    });

    /** Answering false early would show a subscriber the free teaser before their own board. */
    it('is unknown until the entitlement has landed, and false after a failed read', () => {
      loadState.set('loading');

      expect(access.readsWholeBoard()).toBeNull();

      loadState.set('error');

      expect(access.readsWholeBoard()).toBe(false);
    });
  });
});
