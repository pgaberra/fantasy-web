import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountComponent } from './account';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';

describe('AccountComponent', () => {
  const openPortal = vi.fn();
  const refresh = vi.fn();
  const premium = signal(false);
  const status = signal('none');
  const currentPeriodEnd = signal<string | null>(null);
  const cancelAtPeriodEnd = signal(false);
  const loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded');
  const realLocation = window.location;
  const route = { snapshot: { queryParamMap: { get: (): string | null => null } } };

  beforeEach(() => {
    openPortal.mockReset();
    refresh.mockReset();
    premium.set(false);
    status.set('none');
    currentPeriodEnd.set(null);
    cancelAtPeriodEnd.set(false);
    loadState.set('loaded');
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    return MockBuilder(AccountComponent)
      .mock(BillingService, { openPortal })
      .mock(EntitlementService, {
        premium,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        loadState,
        refresh,
      })
      .mock(NotificationService, { error: vi.fn() })
      .provide({ provide: ActivatedRoute, useValue: route });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('refreshes the entitlement on init', () => {
    MockRender(AccountComponent);

    expect(refresh).toHaveBeenCalled();
  });

  it('shows the free state with a link to Premium', () => {
    premium.set(false);

    const fixture = MockRender(AccountComponent);

    expect(fixture.nativeElement.textContent).toContain('Free plan');
    expect(fixture.nativeElement.textContent).toContain('See Premium');
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
});
