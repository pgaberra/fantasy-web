import { DatePipe } from '@angular/common';
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
import { ErrorReportingService } from '../services/error-reporting.service';
import { NotificationService } from '../services/notification.service';
import { FeatureService } from '../services/feature.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { PaddleConfigurationError } from '../shared/paddle/paddle';
import { PaddleService } from '../shared/paddle/paddle.service';

const initializePaddle = vi.fn();
const PricePreview = vi.fn();
const report = vi.fn();

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
    initializePaddle.mockReset();
    PricePreview.mockReset();
    report.mockReset();
    PricePreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        details: { lineItems: [{ formattedTotals: { total: '$4.99' } }] },
      },
    });
    initializePaddle.mockResolvedValue({ PricePreview });
    environment.paddleClientToken = 'test_token';
    environment.paddlePriceId = 'pri_1';
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
        .mock(ErrorReportingService, { report })
        .mock(PaddleService, { initialize: initializePaddle })
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

  it('shows a Subscribe button for a signed-in user without Premium', () => {
    const fixture = MockRender(PremiumComponent);

    expect(fixture.nativeElement.textContent).toContain('Subscribe');
  });

  it('prompts a signed-out user to sign in', () => {
    loggedIn.set(false);

    const fixture = MockRender(PremiumComponent);

    expect(fixture.nativeElement.textContent).toContain('Sign in to subscribe');
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
    const pending = ngMocks.find(LoadingIndicatorComponent);
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
     * Paddle redirects the browser the moment the payment clears and tells our server separately.
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
     * The first thing a new subscriber should see is where the things they just paid for live,
     * so the welcome carries a link into each of them. Only once the subscription has actually
     * landed: before that the page cannot vouch for what is theirs.
     */
    it('welcomes a new subscriber with the way into each perk once the subscription lands', () => {
      premium.set(false);
      const fixture = MockRender(PremiumComponent);
      expect(fixture.nativeElement.textContent).not.toContain('Welcome to Premium');

      premium.set(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Welcome to Premium');
      const links = ngMocks
        .findAll('.checkout-welcome-links a')
        .map((link) => ngMocks.input(link, 'routerLink'));
      expect(links).toContain('/whos-hot');
      const card = ngMocks.find('.plan-card--premium').nativeElement as HTMLElement;
      expect(card.textContent).toContain('Premium active');
      expect(card.textContent).not.toContain('Confirming');
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

  // The price arrives through a chain of promises, so waiting a fixed number of microtask
  // ticks is guesswork. A macrotask drains the whole queue behind it; then the view is
  // checked, since the signal is set long after the first render.
  async function settle(fixture: { detectChanges: () => void }): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  /**
   * The catalog holds a base price in USD and a local price per country, so the figure on the
   * page has to come from Paddle. A number written into the template would be right for one
   * country and wrong everywhere else, and quoting one price while charging another is how a
   * sale is lost.
   */
  it('shows the price Paddle quotes for this visitor', async () => {
    const fixture = MockRender(PremiumComponent);

    await settle(fixture);

    expect(PricePreview).toHaveBeenCalledWith({ items: [{ priceId: 'pri_1', quantity: 1 }] });
    expect(ngMocks.formatText(ngMocks.find('.plan-card--premium .plan-price-amount'))).toContain(
      '$4.99',
    );
  });

  /**
   * Zero costs the same everywhere, but it is not written the same everywhere: a Swedish
   * reader is quoted "0 kr" and an American "$0". The currency is taken from the same preview
   * as the Premium price, so the two columns can never be priced in different money.
   */
  it('prices the free plan at zero in the currency Paddle quoted', async () => {
    const fixture = MockRender(PremiumComponent);

    await settle(fixture);

    expect(ngMocks.formatText(ngMocks.find('.plan-card--free .plan-price-amount'))).toEqual('$0');
  });

  it('writes the free plan’s zero in a Swedish reader’s own currency', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('sv-SE');
    PricePreview.mockResolvedValue({
      data: {
        currencyCode: 'SEK',
        details: { lineItems: [{ formattedTotals: { total: '49 kr' } }] },
      },
    });

    const fixture = MockRender(PremiumComponent);
    await settle(fixture);

    expect(ngMocks.formatText(ngMocks.find('.plan-card--free .plan-price-amount'))).toContain('kr');
  });

  // Without a currency there is no way to write the zero, and guessing at dollars would price
  // the plan in money the reader may never be charged in. The card says the word instead: the
  // paid price depends on Paddle, the free one must not.
  it('says the free plan is free when Paddle cannot be reached', async () => {
    initializePaddle.mockRejectedValue(new Error('offline'));

    const fixture = MockRender(PremiumComponent);
    await settle(fixture);

    expect(ngMocks.formatText(ngMocks.find('.plan-card--free .plan-price-amount'))).toEqual('Free');
  });

  // A build that sells nothing has no price id, and must not call Paddle at all - that call is
  // what puts Paddle's script on a public page.
  it('asks Paddle nothing when the build has no price id', async () => {
    environment.paddlePriceId = '';

    const fixture = MockRender(PremiumComponent);
    await settle(fixture);

    expect(initializePaddle).not.toHaveBeenCalled();
    expect(ngMocks.findAll('.plan-card--premium .plan-price-amount').length).toEqual(0);
  });

  // Losing the price is not worth an error toast on a marketing page. The card still reads.
  it('renders the card without a price when Paddle cannot be reached', async () => {
    initializePaddle.mockRejectedValue(new Error('offline'));

    const fixture = MockRender(PremiumComponent);
    await settle(fixture);

    expect(ngMocks.findAll('.plan-card--premium .plan-price-amount').length).toEqual(0);
    expect(error).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(ngMocks.findAll('.plan-card--premium .plan-name').length).toEqual(1);
  });

  // A token that names no Paddle environment is a broken build, not a network blip. The card still
  // reads, and still says nothing to the visitor, but the fault is reported rather than hidden.
  it('reports a client token that names no Paddle environment', async () => {
    initializePaddle.mockRejectedValue(new PaddleConfigurationError('no environment'));

    const fixture = MockRender(PremiumComponent);
    await settle(fixture);

    expect(PricePreview).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(expect.any(PaddleConfigurationError));
    expect(error).not.toHaveBeenCalled();
    expect(ngMocks.findAll('.plan-card--premium .plan-name').length).toEqual(1);
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
});
