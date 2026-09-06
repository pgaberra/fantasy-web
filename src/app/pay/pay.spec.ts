import { ActivatedRoute } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayComponent } from './pay';
import { environment } from '../../environments/environment';

const open = vi.fn();
const initializePaddle = vi.fn();

vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: (...args: unknown[]) => initializePaddle(...args),
  CheckoutEventNames: { CHECKOUT_ERROR: 'checkout.error' },
}));

describe('PayComponent', () => {
  const queryParams = new Map<string, string>();
  const route = {
    snapshot: { queryParamMap: { get: (key: string) => queryParams.get(key) ?? null } },
  };

  beforeEach(() => {
    open.mockReset();
    initializePaddle.mockReset();
    initializePaddle.mockResolvedValue({ Checkout: { open } });
    queryParams.clear();
    queryParams.set('_ptxn', 'txn_1');
    environment.paddleClientToken = 'test_token';
    environment.paddleEnvironment = 'sandbox';
    return MockBuilder(PayComponent).provide({ provide: ActivatedRoute, useValue: route });
  });

  // The failure states differ in when they are reached: a missing transaction id fails inside
  // ngOnInit, while a rejected initialize fails a tick later, so the view has to be checked
  // again after the promises settle or the second kind never reaches the DOM.
  async function render(): Promise<void> {
    const fixture = MockRender(PayComponent);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  it('opens the checkout for the transaction in the URL', async () => {
    await render();

    expect(initializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test_token', environment: 'sandbox' }),
    );
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'txn_1' }),
    );
  });

  /** Paddle requires an absolute success URL, and the account page is what reads the result. */
  it('sends the browser to the account page after a completed payment', async () => {
    await render();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          successUrl: `${window.location.origin}/account?checkout=success`,
        }),
      }),
    );
  });

  it('shows the failure state and opens nothing without a transaction id', async () => {
    queryParams.clear();

    await render();

    expect(initializePaddle).not.toHaveBeenCalled();
    expect(ngMocks.formatText(ngMocks.find('h1'))).toContain('Checkout could not be opened');
  });

  /**
   * A build with no client token cannot open a checkout, and saying so beats a page that sits
   * on "Opening secure checkout" forever.
   */
  it('shows the failure state when the build has no client token', async () => {
    environment.paddleClientToken = '';

    await render();

    expect(initializePaddle).not.toHaveBeenCalled();
    expect(ngMocks.formatText(ngMocks.find('h1'))).toContain('Checkout could not be opened');
  });

  it('shows the failure state when Paddle cannot be initialized', async () => {
    initializePaddle.mockRejectedValue(new Error('nope'));

    await render();

    expect(ngMocks.formatText(ngMocks.find('h1'))).toContain('Checkout could not be opened');
  });
});
