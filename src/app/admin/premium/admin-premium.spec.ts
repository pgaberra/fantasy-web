import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AdminPremiumComponent } from './admin-premium';
import { AdminService } from '../../services/admin.service';
import { AdminPremiumCustomerResponse } from '../../api/models';

const PAYING: AdminPremiumCustomerResponse = {
  userId: 'user-paying',
  email: 'payer@example.com',
  source: 'subscription',
  cancelAtPeriodEnd: false,
  provider: 'stripe',
  subscriptionStatus: 'active',
  currentPeriodEnd: '2026-10-01T00:00:00Z',
  premiumUntil: '2026-10-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

const GIVEN: AdminPremiumCustomerResponse = {
  userId: 'user-friend',
  email: 'friend@example.com',
  source: 'grant',
  cancelAtPeriodEnd: false,
  grantExpiresAt: '2026-11-09T00:00:00Z',
  premiumUntil: '2026-11-09T00:00:00Z',
  grantedBy: 'admin@example.com',
  grantReason: 'a friend',
  createdAt: '2026-02-01T00:00:00Z',
};

describe('AdminPremiumComponent', () => {
  const premiumCustomers = vi.fn();
  const grantPremium = vi.fn();
  const revokePremiumGrants = vi.fn();

  beforeEach(() => {
    premiumCustomers.mockReturnValue(of([PAYING, GIVEN]));
    grantPremium.mockReturnValue(
      of({
        userId: 'user-friend',
        email: 'friend@example.com',
        expiresAt: '2026-11-09T00:00:00Z',
        grantedBy: 'admin@example.com',
      }),
    );
    revokePremiumGrants.mockReturnValue(of(undefined));
    return MockBuilder(AdminPremiumComponent).mock(AdminService, {
      premiumCustomers,
      grantPremium,
      revokePremiumGrants,
    });
  });

  it('lists both kinds of member and says which is which', () => {
    const fixture = MockRender(AdminPremiumComponent);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('payer@example.com');
    expect(text).toContain('Paid');
    expect(text).toContain('friend@example.com');
    expect(text).toContain('Given');
    expect(text).toContain('a friend');
  });

  it('says so plainly when nobody has Premium', () => {
    premiumCustomers.mockReturnValue(of([]));

    const fixture = MockRender(AdminPremiumComponent);

    expect(fixture.nativeElement.textContent).toContain('Nobody has Premium yet.');
  });

  it("names the failure rather than saying something went wrong when the list won't load", () => {
    premiumCustomers.mockReturnValue(throwError(() => new Error('down')));

    const fixture = MockRender(AdminPremiumComponent);

    expect(fixture.nativeElement.textContent).toContain("Couldn't load Premium members.");
  });

  /**
   * Only a given membership can be ended here. A paying member's row must not offer it: there is
   * nothing to take back, and pressing it would say nothing happened.
   */
  it('offers an end button only for a membership that was given', () => {
    const fixture = MockRender(AdminPremiumComponent);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.premium-actions .btn',
    );

    expect(buttons).toHaveLength(1);
  });

  it('ends a given membership', () => {
    const fixture = MockRender(AdminPremiumComponent);
    fixture.point.componentInstance.revoke(GIVEN);
    fixture.detectChanges();

    expect(revokePremiumGrants).toHaveBeenCalledWith('user-friend');
  });

  it('sends the months asked for and confirms the date it runs to', () => {
    const fixture = MockRender(AdminPremiumComponent);
    const component = fixture.point.componentInstance;
    component.email.set('friend@example.com');
    component.months.set(2);
    component.reason.set('a friend');
    component.grant();
    fixture.detectChanges();

    expect(grantPremium).toHaveBeenCalledWith({
      email: 'friend@example.com',
      months: 2,
      reason: 'a friend',
    });
    expect(fixture.nativeElement.textContent).toContain('friend@example.com has Premium until');
  });

  it('says an unknown email is unknown rather than blaming the request', () => {
    grantPremium.mockReturnValue(throwError(() => ({ status: 404 })));

    const fixture = MockRender(AdminPremiumComponent);
    fixture.point.componentInstance.email.set('stranger@example.com');
    fixture.point.componentInstance.grant();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No account with that email.');
  });
});
