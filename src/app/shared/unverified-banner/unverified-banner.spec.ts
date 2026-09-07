import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnverifiedBannerComponent } from './unverified-banner';
import { AuthService } from '../../services/auth.service';

const isLoggedIn = signal(true);
const isEmailVerified = signal(false);
const getEmail = vi.fn<() => string | null>(() => 'manager@example.com');
const resendVerification = vi.fn(() => of<void>(undefined));

function setup() {
  return MockBuilder(UnverifiedBannerComponent).provide({
    provide: AuthService,
    useValue: { isLoggedIn, isEmailVerified, getEmail, resendVerification },
  });
}

describe('UnverifiedBannerComponent', () => {
  beforeEach(() => {
    isLoggedIn.set(true);
    isEmailVerified.set(false);
    getEmail.mockClear();
    resendVerification.mockClear();
  });

  it('shows the verify prompt when logged in and unverified', async () => {
    await setup();
    MockRender(UnverifiedBannerComponent);
    const text = ngMocks.find('.unverified-banner__text').nativeElement as HTMLElement;
    expect(text.textContent).toContain('Verify your email');
  });

  it('renders nothing when the email is verified', async () => {
    isEmailVerified.set(true);
    await setup();
    MockRender(UnverifiedBannerComponent);
    expect(ngMocks.findAll('.unverified-banner').length).toEqual(0);
  });

  it('renders nothing when the user is not logged in', async () => {
    isLoggedIn.set(false);
    await setup();
    MockRender(UnverifiedBannerComponent);
    expect(ngMocks.findAll('.unverified-banner').length).toEqual(0);
  });

  it('resends the verification email and shows the sent confirmation', async () => {
    await setup();
    const fixture = MockRender(UnverifiedBannerComponent);
    const component = fixture.point.componentInstance;

    await component.resend();
    fixture.detectChanges();

    expect(resendVerification).toHaveBeenCalledWith('manager@example.com');
    expect(component.sent()).toEqual(true);
    const text = ngMocks.find('.unverified-banner__text').nativeElement as HTMLElement;
    expect(text.textContent).toContain('Verification email sent');
  });
});
