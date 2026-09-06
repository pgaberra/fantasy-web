import { DatePipe } from '@angular/common';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountComponent } from './account';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';

describe('AccountComponent', () => {
  const openPortal = vi.fn();
  const notifyError = vi.fn();
  const refresh = vi.fn();
  const premium = signal(false);
  const status = signal('none');
  const currentPeriodEnd = signal<string | null>(null);
  const cancelAtPeriodEnd = signal(false);
  const loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded');
  const realLocation = window.location;
  const checkoutParam = signal<string | null>(null);
  const route = { snapshot: { queryParamMap: { get: () => checkoutParam() } } };

  beforeEach(() => {
    openPortal.mockReset();
    notifyError.mockReset();
    refresh.mockReset();
    premium.set(false);
    status.set('none');
    currentPeriodEnd.set(null);
    cancelAtPeriodEnd.set(false);
    loadState.set('loaded');
    checkoutParam.set(null);
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    return (
      MockBuilder(AccountComponent)
        // The dates are part of what the page says, so the pipe that formats them stays real.
        .keep(DatePipe)
        .mock(BillingService, { openPortal })
        .mock(EntitlementService, {
          premium,
          status,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          loadState,
          refresh,
        })
        .mock(NotificationService, { error: notifyError })
        .provide({ provide: ActivatedRoute, useValue: route })
    );
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('refreshes the entitlement on init', () => {
    MockRender(AccountComponent);

    expect(refresh).toHaveBeenCalled();
  });

  it('shows the free state, what Premium would add, and the way to it', () => {
    premium.set(false);

    const fixture = MockRender(AccountComponent);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Free plan');
    expect(text).toContain('Premium adds');
    expect(text).toContain('Upgrade to Premium');
    expect(ngMocks.find('a.btn-primary').attributes['routerLink']).toEqual('/pricing');
  });

  it('says when a cancelled subscription ends, and that nothing more is charged', () => {
    premium.set(true);
    cancelAtPeriodEnd.set(true);
    currentPeriodEnd.set('2026-10-07T09:00:00Z');

    const fixture = MockRender(AccountComponent);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('You keep Premium until October 7, 2026');
    expect(text).toContain('nothing more is charged');
    expect(text).not.toContain('Renews on');
  });

  /**
   * The first thing a new subscriber should see is where the things they just paid for live,
   * so the welcome carries a link into each of them. Only once the subscription has actually
   * landed: before that the page cannot vouch for what is theirs.
   */
  it('welcomes a new subscriber with the way into each perk once the subscription lands', () => {
    checkoutParam.set('success');
    premium.set(false);
    const fixture = MockRender(AccountComponent);
    expect(fixture.nativeElement.textContent).not.toContain('Welcome to Premium');

    premium.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Welcome to Premium');
    const links = ngMocks
      .findAll('.account-welcome-links a')
      .map((link) => ngMocks.input(link, 'routerLink'));
    expect(links).toContain('/whos-hot');
  });

  it('shows the manage button and opens the portal when premium', () => {
    premium.set(true);
    openPortal.mockReturnValue(of({ portalUrl: 'https://portal.example/go' }));

    const fixture = MockRender(AccountComponent);
    expect(fixture.nativeElement.textContent).toContain('Premium active');

    ngMocks.find<HTMLButtonElement>('.btn-primary').nativeElement.click();

    expect(openPortal).toHaveBeenCalled();
    expect(window.location.href).toEqual('https://portal.example/go');
  });

  /**
   * Opening the portal fails when something on our side is wrong, never because the user did
   * anything, so the copy says what is safe rather than telling them to retry: the
   * subscription is untouched. Pinned so that promise cannot quietly stop being true.
   */
  it('says the subscription is unchanged when the portal cannot be opened', () => {
    openPortal.mockReturnValue(throwError(() => new Error('502')));

    const fixture = MockRender(AccountComponent);
    fixture.point.componentInstance.manageBilling();

    expect(notifyError).toHaveBeenCalledWith(
      expect.stringContaining('Your subscription is unchanged'),
    );
    expect(notifyError).not.toHaveBeenCalledWith(expect.stringContaining('try again'));
  });

  /**
   * Paddle redirects the browser the moment the payment clears and tells our server separately.
   * The redirect wins, so the first read still says free plan. Showing that told someone who had
   * just paid that they had no subscription, right under a banner thanking them for subscribing.
   */
  it('does not call a just-paid account free while the confirmation is still coming', () => {
    checkoutParam.set('success');
    premium.set(false);

    MockRender(AccountComponent);

    const text = (ngMocks.find('.account-card').nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Confirming');
    expect(text).not.toContain('Free plan');
    expect(text).not.toContain("You don't have an active subscription");
  });

  it('shows the subscription as soon as the confirmation lands', () => {
    checkoutParam.set('success');
    premium.set(false);
    const fixture = MockRender(AccountComponent);

    premium.set(true);
    fixture.detectChanges();

    const text = (ngMocks.find('.account-card').nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Premium active');
    expect(text).not.toContain('Confirming');
  });

  // Only the return from checkout is a race. An ordinary visit with no subscription is a fact,
  // and hiding it behind "confirming" would leave the free plan with no way to see itself.
  it('still calls an ordinary account free when it has no subscription', () => {
    checkoutParam.set(null);
    premium.set(false);

    MockRender(AccountComponent);

    const text = (ngMocks.find('.account-card').nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Free plan');
    expect(text).not.toContain('Confirming');
  });
});
