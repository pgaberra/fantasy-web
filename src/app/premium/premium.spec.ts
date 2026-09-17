import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PremiumComponent } from './premium';
import { environment } from '../../environments/environment';
import { BillingService } from '../services/billing.service';
import { AuthService } from '../services/auth.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';
import { FeatureService } from '../services/feature.service';

/** What the browser fires when Back brings a page back out of its back/forward cache. */
function restoreFromBackForwardCache(): void {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
}

describe('PremiumComponent', () => {
  const startCheckout = vi.fn();
  const openPortal = vi.fn();
  const refresh = vi.fn();
  const error = vi.fn();
  const loggedIn = signal(true);
  const premium = signal(false);
  const status = signal('none');
  const currentPeriodEnd = signal<string | null>(null);
  const cancelAtPeriodEnd = signal(false);
  const source = signal('none');
  const premiumUntil = signal<string | null>(null);
  const granted = computed(() => source() === 'grant');
  const loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded');
  const checkoutParam = signal<string | null>(null);
  const route = { snapshot: { queryParamMap: { get: () => checkoutParam() } } };
  const realLocation = window.location;

  beforeEach(() => {
    startCheckout.mockReset();
    openPortal.mockReset();
    refresh.mockReset();
    error.mockReset();
    loggedIn.set(true);
    premium.set(false);
    status.set('none');
    currentPeriodEnd.set(null);
    cancelAtPeriodEnd.set(false);
    source.set('none');
    premiumUntil.set(null);
    loadState.set('loaded');
    checkoutParam.set(null);
    environment.premiumBasePriceUsd = '4.99';
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    return (
      MockBuilder(PremiumComponent)
        // The dates are part of what the page says, so the pipe that formats them stays real.
        .keep(DatePipe)
        .mock(BillingService, { startCheckout, openPortal })
        .mock(AuthService, { isLoggedIn: loggedIn })
        .mock(EntitlementService, {
          premium,
          status,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          source,
          premiumUntil,
          granted,
          loadState,
          refresh,
        })
        .mock(NotificationService, { error })
        .mock(FeatureService, { aiProjection: signal(true) })
        .provide({ provide: ActivatedRoute, useValue: route })
    );
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    vi.restoreAllMocks();
  });

  /**
   * Premium given by an admin has no subscription behind it, so the billing portal would open on
   * nothing. The page has to say where the membership came from and offer no way to manage it.
   */
  it('says Premium was given, and offers no portal, when nothing was paid for it', () => {
    premium.set(true);
    source.set('grant');
    premiumUntil.set('2026-11-09T00:00:00Z');

    const fixture = MockRender(PremiumComponent);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Premium was given to you, free, until');
    expect(text).not.toContain('Manage subscription');
  });

  it('gives Subscribe back when the visitor comes back from checkout without paying', () => {
    startCheckout.mockReturnValue(of({ checkoutUrl: 'https://checkout.example/go' }));
    const fixture = MockRender(PremiumComponent);
    const button = () =>
      ngMocks.find<HTMLButtonElement>('.plan-card--premium .plan-cta button').nativeElement;

    button().click();
    fixture.detectChanges();
    expect(window.location.href).toEqual('https://checkout.example/go');
    expect(button().disabled).toBe(true);

    restoreFromBackForwardCache();
    fixture.detectChanges();

    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Subscribe');
  });

  it('shows a Subscribe button for a signed-in user without Premium', () => {
    const fixture = MockRender(PremiumComponent);

    expect(fixture.nativeElement.textContent).toContain('Subscribe');
  });

  it('prompts a signed-out user to sign in', () => {
    loggedIn.set(false);

    const fixture = MockRender(PremiumComponent);

    expect(fixture.nativeElement.textContent).toContain('Sign in to subscribe');
  });

  /**
   * Premium is announced before it is sold. Whoever would have been offered checkout, or asked to
   * sign in for it, gets a disabled Subscribe button and the note instead; a subscriber or a
   * granted account still sees their own plan.
   */
  describe('while Premium is coming soon', () => {
    beforeEach(() => {
      environment.premiumComingSoon = true;
    });

    afterEach(() => {
      environment.premiumComingSoon = false;
    });

    it('disables Subscribe for a signed-in user without Premium, and says why', () => {
      MockRender(PremiumComponent);

      const button = ngMocks.find<HTMLButtonElement>('.plan-card--premium .plan-cta button');
      expect(button.nativeElement.textContent).toContain('Subscribe');
      expect(button.nativeElement.disabled).toBe(true);
      expect(ngMocks.find('.plan-card--premium .plan-cta').nativeElement.textContent).toContain(
        'Subscriptions open soon.',
      );

      button.nativeElement.click();
      expect(startCheckout).not.toHaveBeenCalled();
    });

    it('offers a signed-out visitor the same note rather than a way to sign in for it', () => {
      loggedIn.set(false);

      MockRender(PremiumComponent);

      const cta = ngMocks.find('.plan-card--premium .plan-cta').nativeElement as HTMLElement;
      expect(cta.textContent).toContain('Subscriptions open soon.');
      expect(cta.textContent).not.toContain('Sign in to subscribe');
    });

    it('still shows a subscriber their plan', () => {
      premium.set(true);

      MockRender(PremiumComponent);

      const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
      expect(card.textContent).toContain('Premium active');
      expect(card.textContent).not.toContain('Subscriptions open soon.');
    });
  });

  // The perks are the page's argument, so both columns have to actually say something: the
  // free plan by name, and Premium as a list of things rather than "features as they roll out".
  it('lists what the free plan has and what Premium adds to it', () => {
    const fixture = MockRender(PremiumComponent);

    const text = fixture.nativeElement.textContent;
    expect(ngMocks.findAll('.plan-card--free .plan-perks li').length).toBeGreaterThan(2);
    expect(text).toContain('Everything in Free');
    expect(text).toContain('AI projection');
  });

  it('redirects to the checkout URL when Subscribe is clicked', () => {
    startCheckout.mockReturnValue(of({ checkoutUrl: 'https://checkout.example/go' }));
    MockRender(PremiumComponent);

    ngMocks.find<HTMLButtonElement>('.plan-card--premium .btn-primary').nativeElement.click();

    expect(startCheckout).toHaveBeenCalled();
    expect(window.location.href).toEqual('https://checkout.example/go');
  });

  // The page reads the entitlement again on arrival because it is where checkout and the
  // billing portal come back to, and the plan is the thing they may just have changed.
  it('re-reads the plan on arrival', () => {
    MockRender(PremiumComponent);

    expect(refresh).toHaveBeenCalled();
  });

  /**
   * The whole reason the subscription page is gone: a subscriber who opens this one has to find
   * their subscription here, and must never be handed a second checkout for a plan they already
   * pay for.
   */
  describe('for a subscriber', () => {
    beforeEach(() => premium.set(true));

    it('replaces Subscribe with the way into the billing portal', () => {
      openPortal.mockReturnValue(of({ portalUrl: 'https://portal.example/go' }));

      MockRender(PremiumComponent);
      const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
      expect(card.textContent).toContain('Premium active');
      expect(card.textContent).not.toContain('Subscribe');

      ngMocks.find<HTMLButtonElement>('.plan-card--premium .plan-cta button').nativeElement.click();

      expect(openPortal).toHaveBeenCalled();
      expect(window.location.href).toEqual('https://portal.example/go');
    });

    /**
     * Back from Stripe restores this page from the back/forward cache exactly as it was left, so
     * the button stood disabled at "Opening" until the page was reloaded.
     */
    it('gives the portal button back, and re-reads the plan, when the visitor comes back', () => {
      openPortal.mockReturnValue(of({ portalUrl: 'https://portal.example/go' }));
      const fixture = MockRender(PremiumComponent);
      const button = () =>
        ngMocks.find<HTMLButtonElement>('.plan-card--premium .plan-cta button').nativeElement;

      button().click();
      fixture.detectChanges();
      expect(button().disabled).toBe(true);
      refresh.mockClear();

      restoreFromBackForwardCache();
      fixture.detectChanges();

      expect(button().disabled).toBe(false);
      expect(button().textContent).toContain('Manage subscription');
      expect(refresh).toHaveBeenCalled();
    });

    it('says when the next charge falls', () => {
      currentPeriodEnd.set('2026-10-07T09:00:00Z');

      const fixture = MockRender(PremiumComponent);

      expect(fixture.nativeElement.textContent).toContain('Renews on October 7, 2026');
    });

    it('says when a cancelled subscription ends, and that nothing more is charged', () => {
      cancelAtPeriodEnd.set(true);
      currentPeriodEnd.set('2026-10-07T09:00:00Z');

      const fixture = MockRender(PremiumComponent);

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Premium remains active until October 7, 2026');
      expect(text).toContain('No further charges will be made');
      expect(text).not.toContain('Renews on');
    });

    /**
     * Opening the portal fails when something on our side is wrong, never because the user did
     * anything, so the copy says what is safe rather than telling them to retry: the
     * subscription is untouched. Pinned so that promise cannot quietly stop being true.
     */
    it('says the subscription is unchanged when the portal cannot be opened', () => {
      openPortal.mockReturnValue(throwError(() => new Error('502')));

      const fixture = MockRender(PremiumComponent);
      fixture.point.componentInstance.manageBilling();

      expect(error).toHaveBeenCalledWith(expect.stringContaining('Your subscription is unchanged'));
      expect(error).not.toHaveBeenCalledWith(expect.stringContaining('try again'));
    });
  });

  /**
   * The plan is read per visit, and a Subscribe button rendered before that read lands would sell
   * a subscriber the plan they already have. So nothing is offered until the plan is known.
   */
  it('offers nothing until the plan has been read', () => {
    loadState.set('loading');

    MockRender(PremiumComponent);

    const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
    const pending = ngMocks.find('.plan-lead app-loading-indicator');
    expect(ngMocks.input(pending, 'label')).toEqual('Loading your plan');
    expect(card.contains(pending.nativeElement)).toBe(true);
    expect(card.textContent).not.toContain('Subscribe');
  });

  it('offers a way to try again when the plan cannot be read', () => {
    loadState.set('error');

    MockRender(PremiumComponent);

    const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
    expect(card.textContent).toContain("Couldn't load your plan");
    expect(card.textContent).not.toContain('Subscribe');
  });

  describe('back from checkout', () => {
    beforeEach(() => checkoutParam.set('success'));

    /**
     * Stripe redirects the browser the moment the payment clears and tells our server separately.
     * The redirect wins, so the first read still says free plan. Offering Subscribe there put a
     * second checkout in front of someone who had just paid, under a banner thanking them for
     * subscribing.
     */
    it('does not offer a just-paid account a second checkout while confirmation is coming', () => {
      premium.set(false);

      MockRender(PremiumComponent);

      const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
      expect(card.textContent).toContain('Confirming');
      expect(card.textContent).not.toContain('Subscribe');
    });

    /**
     * The welcome waits until the subscription has actually landed: before that the page cannot
     * vouch that Premium is active.
     */
    it('welcomes a new subscriber once the subscription lands', () => {
      premium.set(false);
      const fixture = MockRender(PremiumComponent);
      expect(fixture.nativeElement.textContent).not.toContain('Welcome to Premium');

      premium.set(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Welcome to Premium');
      expect(ngMocks.findAll('.checkout-welcome a')).toHaveLength(0);
      const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
      expect(card.textContent).toContain('Premium active');
      expect(card.textContent).not.toContain('Confirming');
    });

    /**
     * The webhook that grants Premium can land seconds after the redirect, so the page keeps asking
     * until it does, and stops asking once it has.
     */
    it('keeps reading the plan until the subscription lands, then stops', () => {
      vi.useFakeTimers();
      try {
        premium.set(false);
        const fixture = MockRender(PremiumComponent);
        expect(refresh).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(2_000);
        expect(refresh).toHaveBeenCalledTimes(2);

        premium.set(true);
        fixture.detectChanges();
        vi.advanceTimersByTime(10_000);
        expect(refresh).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Only the return from checkout is a race. An ordinary visit with no subscription is a fact,
  // and hiding it behind "confirming" would leave a free account with no way to subscribe.
  it('still offers checkout to an ordinary account with no subscription', () => {
    checkoutParam.set(null);
    premium.set(false);

    MockRender(PremiumComponent);

    const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
    expect(card.textContent).toContain('Subscribe');
    expect(card.textContent).not.toContain('Confirming');
  });

  /**
   * The price comes from the build, the same figure the prerendered page states, so a reader with
   * JavaScript and one without are quoted one price. The free card writes its zero the same way.
   */
  it("quotes the build's price, and prices the free plan to match", () => {
    MockRender(PremiumComponent);

    expect(ngMocks.formatText(ngMocks.find('.plan-card--premium .plan-price-amount'))).toEqual(
      '$4.99',
    );
    expect(ngMocks.formatText(ngMocks.find('.plan-card--free .plan-price-amount'))).toEqual(
      '$0.00',
    );
  });

  // A build with no price has no figure to match, so the free card says the word, and the Premium
  // card says where the price will be confirmed rather than inventing one.
  it('says where the price is confirmed when the build has none', () => {
    environment.premiumBasePriceUsd = '';

    MockRender(PremiumComponent);

    expect(ngMocks.formatText(ngMocks.find('.plan-card--premium .plan-price'))).toEqual(
      'Your exact price is confirmed at checkout.',
    );
    expect(ngMocks.formatText(ngMocks.find('.plan-card--free .plan-price-amount'))).toEqual('Free');
  });

  /**
   * The BFF answers 502 when the payment provider is misconfigured, which is a fault on our
   * side. Telling the user to try again would send them at something that cannot work, so the
   * promise the copy makes instead is that no money moved. Pinned, because that promise going
   * stale would be a lie told at a payment step.
   */
  it('says nothing was charged when checkout cannot be started', () => {
    startCheckout.mockReturnValue(throwError(() => new Error('502')));

    const fixture = MockRender(PremiumComponent);
    fixture.point.componentInstance.subscribe();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Nothing was charged'));
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('try again'));
  });

  /**
   * A second tab, or a page left open, can ask for a checkout the account no longer needs. The BFF
   * refuses it with 409 so nobody pays twice, and the page reads the plan again so the card shows
   * the subscription, rather than an error about a checkout that should never have started.
   */
  it('shows the subscription instead of an error when the account already has one', () => {
    startCheckout.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

    const fixture = MockRender(PremiumComponent);
    refresh.mockClear();
    fixture.point.componentInstance.subscribe();

    expect(refresh).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
