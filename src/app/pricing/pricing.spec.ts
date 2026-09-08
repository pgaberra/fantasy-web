import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingComponent } from './pricing';
import { environment } from '../../environments/environment';
import { BillingService } from '../services/billing.service';
import { AuthService } from '../services/auth.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';

const initializePaddle = vi.fn();
const PricePreview = vi.fn();

vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: (...args: unknown[]) => initializePaddle(...args),
}));

describe('PricingComponent', () => {
  const startCheckout = vi.fn();
  const error = vi.fn();
  const loggedIn = signal(true);
  const premium = signal(false);
  const realLocation = window.location;

  beforeEach(() => {
    startCheckout.mockReset();
    error.mockReset();
    loggedIn.set(true);
    premium.set(false);
    initializePaddle.mockReset();
    PricePreview.mockReset();
    PricePreview.mockResolvedValue({
      data: { details: { lineItems: [{ formattedTotals: { total: '$4.99' } }] } },
    });
    initializePaddle.mockResolvedValue({ PricePreview });
    environment.paddleClientToken = 'test_token';
    environment.paddlePriceId = 'pri_1';
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    return MockBuilder(PricingComponent)
      .mock(BillingService, { startCheckout })
      .mock(AuthService, { isLoggedIn: loggedIn })
      .mock(EntitlementService, { premium })
      .mock(NotificationService, { error });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('shows a Subscribe button for a signed-in user', () => {
    const fixture = MockRender(PricingComponent);

    expect(fixture.nativeElement.textContent).toContain('Subscribe');
  });

  it('prompts a signed-out user to sign in', () => {
    loggedIn.set(false);

    const fixture = MockRender(PricingComponent);

    expect(fixture.nativeElement.textContent).toContain('Sign in to subscribe');
  });

  // A Subscribe button shown to a subscriber starts a second checkout for a plan they already
  // pay for. They get told they have it, and the way to their subscription instead.
  it('offers a subscriber their subscription rather than a second checkout', () => {
    premium.set(true);

    const fixture = MockRender(PricingComponent);

    expect(fixture.nativeElement.textContent).toContain('You already have Premium');
    expect(ngMocks.findAll('button.btn-primary').length).toEqual(0);
    expect(ngMocks.find('.plan-card--premium a.btn').attributes['routerLink']).toEqual('/account');
  });

  // The perks are the page's argument, so both columns have to actually say something: the
  // free plan by name, and Premium as a list of things rather than "features as they roll out".
  it('lists what the free plan has and what Premium adds to it', () => {
    const fixture = MockRender(PricingComponent);

    const text = fixture.nativeElement.textContent;
    expect(ngMocks.findAll('.plan-card--free .plan-perks li').length).toBeGreaterThan(2);
    expect(text).toContain('Everything in Free');
    expect(text).toContain('AI projection');
  });

  it('redirects to the checkout URL when Subscribe is clicked', () => {
    startCheckout.mockReturnValue(of({ checkoutUrl: 'https://checkout.example/go' }));
    MockRender(PricingComponent);

    ngMocks.find<HTMLButtonElement>('.btn-primary').nativeElement.click();

    expect(startCheckout).toHaveBeenCalled();
    expect(window.location.href).toEqual('https://checkout.example/go');
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
    const fixture = MockRender(PricingComponent);

    await settle(fixture);

    expect(PricePreview).toHaveBeenCalledWith({ items: [{ priceId: 'pri_1', quantity: 1 }] });
    expect(ngMocks.formatText(ngMocks.find('.plan-price-amount'))).toContain('$4.99');
  });

  // A build that sells nothing has no price id, and must not call Paddle at all - that call is
  // what puts Paddle's script on a public page.
  it('asks Paddle nothing when the build has no price id', async () => {
    environment.paddlePriceId = '';

    const fixture = MockRender(PricingComponent);
    await settle(fixture);

    expect(initializePaddle).not.toHaveBeenCalled();
    expect(ngMocks.findAll('.plan-price-amount').length).toEqual(0);
  });

  // Losing the price is not worth an error toast on a marketing page. The card still reads.
  it('renders the card without a price when Paddle cannot be reached', async () => {
    initializePaddle.mockRejectedValue(new Error('offline'));

    const fixture = MockRender(PricingComponent);
    await settle(fixture);

    expect(ngMocks.findAll('.plan-price-amount').length).toEqual(0);
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

    const fixture = MockRender(PricingComponent);
    fixture.point.componentInstance.subscribe();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Nothing was charged'));
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('try again'));
  });
});
