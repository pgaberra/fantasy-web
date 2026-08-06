import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingComponent } from './pricing';
import { BillingService } from '../services/billing.service';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

describe('PricingComponent', () => {
  const startCheckout = vi.fn();
  const error = vi.fn();
  const loggedIn = signal(true);
  const realLocation = window.location;

  beforeEach(() => {
    startCheckout.mockReset();
    error.mockReset();
    loggedIn.set(true);
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    return MockBuilder(PricingComponent)
      .mock(BillingService, { startCheckout })
      .mock(AuthService, { isLoggedIn: loggedIn })
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

  it('redirects to the checkout URL when Subscribe is clicked', () => {
    startCheckout.mockReturnValue(of({ checkoutUrl: 'https://checkout.example/go' }));
    MockRender(PricingComponent);

    ngMocks.find<HTMLButtonElement>('.btn-primary').nativeElement.click();

    expect(startCheckout).toHaveBeenCalled();
    expect(window.location.href).toEqual('https://checkout.example/go');
  });
});
