import { ActivatedRoute } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayComponent } from './pay';
import { environment } from '../../environments/environment';
import { ErrorReportingService } from '../services/error-reporting.service';
import { PaddleConfigurationError } from '../shared/paddle/paddle';

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
  const report = vi.fn();

  beforeEach(() => {
    open.mockReset();
    report.mockReset();
    initializePaddle.mockReset();
    initializePaddle.mockResolvedValue({ Checkout: { open } });
    queryParams.clear();
    queryParams.set('_ptxn', 'txn_1');
    environment.paddleClientToken = 'test_token';
    return MockBuilder(PayComponent)
      .mock(ErrorReportingService, { report })
      .provide({ provide: ActivatedRoute, useValue: route });
  });

  // The failure states differ in when they are reached: a missing transaction id fails inside
  // ngOnInit, while a rejected initialize fails some promise hops later, so the view has to be
  // checked again after they settle or the second kind never reaches the DOM. A macrotask waits
  // for all of them, where counting microtasks broke as soon as the chain grew a hop.
  async function render(): Promise<void> {
    const fixture = MockRender(PayComponent);
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  it('opens the checkout for the transaction in the URL', async () => {
    await render();

    expect(initializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test_token', environment: 'sandbox' }),
    );
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'txn_1' }));
  });

  it('opens live Paddle for a live token', async () => {
    environment.paddleClientToken = 'live_token';

    await render();

    expect(initializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'live_token', environment: 'production' }),
    );
  });

  /** Email and card on one page: the BFF has usually filled in the email already. */
  it('opens the one-page overlay checkout', async () => {
    await render();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ displayMode: 'overlay', variant: 'one-page' }),
      }),
    );
  });

  /** Paddle requires an absolute success URL, and the account page is what reads the result. */
  it('sends the browser to the account page after a completed payment', async () => {
    await render();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          successUrl: `${window.location.origin}/premium?checkout=success`,
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

  /**
   * A token that names no environment must not be opened against either account, and the fault
   * is the build's, so it is reported rather than left for a buyer to stumble on.
   */
  it('reports a client token that names no Paddle environment and opens nothing', async () => {
    environment.paddleClientToken = 'pk_unknown';

    await render();

    expect(initializePaddle).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(expect.any(PaddleConfigurationError));
    expect(ngMocks.formatText(ngMocks.find('h1'))).toContain('Checkout could not be opened');
  });

  it('shows the failure state when Paddle cannot be initialized', async () => {
    initializePaddle.mockRejectedValue(new Error('nope'));

    await render();

    expect(report).not.toHaveBeenCalled();
    expect(ngMocks.formatText(ngMocks.find('h1'))).toContain('Checkout could not be opened');
  });
});
