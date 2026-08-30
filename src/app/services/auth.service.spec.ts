import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockBuilder } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AnalyticsService } from './analytics.service';
import { Api } from '../api/api';
import { AuthResponse } from '../api/models';
import { environment } from '../../environments/environment';

const identify = vi.fn();
const reset = vi.fn();
const capture = vi.fn();
const invoke = vi.fn();

function jwtWith(claims: Record<string, string>): string {
  // base64url: swap the two alphabet characters and drop the padding, which only ever
  // trails (so splitting on '=' is enough — a regex here trips sonarjs/super-linear-regex).
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .split('=')[0];
  return `header.${payload}.signature`;
}

function authResponse(token: string, emailVerified = true): AuthResponse {
  return {
    token,
    refreshToken: 'refresh-token',
    expiresInSeconds: 900,
    refreshExpiresInSeconds: 86400,
    admin: false,
    emailVerified,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    identify.mockClear();
    reset.mockClear();
    capture.mockClear();
    invoke.mockReset();

    await MockBuilder(AuthService)
      .provide({ provide: Api, useValue: { invoke } })
      .provide({ provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } })
      .provide({ provide: AnalyticsService, useValue: { identify, reset, capture } });

    service = TestBed.inject(AuthService);
  });

  describe('where signing in lands', () => {
    const signIn = async () => {
      invoke.mockReturnValue(Promise.resolve(authResponse(jwtWith({ sub: 'account-uuid' }))));
      await firstValueFrom(service.login({ email: 'a@example.test', password: 'secret' }));
      return TestBed.inject(Router);
    };

    it('goes to the projections list when nothing asked for somewhere else', async () => {
      const router = await signIn();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/projections');
    });

    it('goes back to the page that sent them, once', async () => {
      service.rememberReturnUrl('/s/abc123');
      const router = await signIn();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/s/abc123');

      // Spent on arrival: the next sign-in this session is not still headed for that share.
      invoke.mockReturnValue(Promise.resolve(authResponse(jwtWith({ sub: 'account-uuid' }))));
      await firstValueFrom(service.login({ email: 'a@example.test', password: 'secret' }));
      expect(router.navigateByUrl).toHaveBeenLastCalledWith('/projections');
    });

    /** The value arrives in a query parameter, so a link could otherwise aim it off-site. */
    it.each(['https://evil.example/steal', '//evil.example/steal', 'evil.example'])(
      'refuses to be sent to %s',
      async (elsewhere) => {
        service.rememberReturnUrl(elsewhere);
        const router = await signIn();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/projections');
      },
    );

    /**
     * A refresh fires on its own behind whatever the reader is looking at — a shared board they
     * signed in to read, say. Sending them to /projections for it would take the page away.
     */
    it('stays put on a silent token refresh', async () => {
      localStorage.setItem('refresh_token', 'refresh-token');
      invoke.mockReturnValue(Promise.resolve(authResponse(jwtWith({ sub: 'account-uuid' }))));

      await firstValueFrom(service.refresh());

      expect(TestBed.inject(Router).navigateByUrl).not.toHaveBeenCalled();
    });
  });

  /**
   * A shared board sends someone here mid-press: the button they chose is on the return URL as
   * `?action=…`, and the board runs it when they land back. Signing up is the path that press is
   * most likely to take, and the one with the most between the press and the landing, so what it
   * carries is worth pinning down rather than reading off the happy path.
   */
  describe('where signing up lands', () => {
    const register = async (emailVerified = true) => {
      invoke.mockReturnValue(
        Promise.resolve(authResponse(jwtWith({ sub: 'account-uuid' }), emailVerified)),
      );
      await firstValueFrom(service.register({ email: 'a@example.test', password: 'secret' }));
      return TestBed.inject(Router);
    };

    it('takes a new account back to the board that sent them', async () => {
      service.rememberReturnUrl('/s/abc123');
      const router = await register();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/s/abc123');
    });

    /** The query string is the press. Trimming the return URL to a bare path would drop it. */
    it('keeps the action the return URL was carrying', async () => {
      service.rememberReturnUrl('/s/abc123?action=draft');
      const router = await register();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/s/abc123?action=draft');
    });

    /**
     * Verifying an email happens out of band, in whatever tab the link from the mail opens. A
     * fresh account is signed in and goes where it was headed; if that ever became a redirect to
     * a "check your inbox" page instead, this is the test that would say so.
     */
    it('does not hold an unverified account back from where it was going', async () => {
      service.rememberReturnUrl('/s/abc123?action=projection');
      const router = await register(false);

      expect(router.navigateByUrl).toHaveBeenCalledWith('/s/abc123?action=projection');
      expect(service.isEmailVerified()).toEqual(false);
    });
  });

  describe('getUserId', () => {
    it('reads the account UUID from the JWT sub claim', () => {
      localStorage.setItem('auth_token', jwtWith({ sub: 'account-uuid', email: 'a@example.com' }));

      expect(service.getUserId()).toEqual('account-uuid');
    });

    // The email claim rides in the same payload; sending it to analytics would stamp PII
    // onto every event row.
    it('does not mistake the email claim for the user id', () => {
      localStorage.setItem('auth_token', jwtWith({ sub: 'account-uuid', email: 'a@example.com' }));

      expect(service.getUserId()).toEqual('account-uuid');
      expect(service.getEmail()).toEqual('a@example.com');
    });

    it('returns null with no token', () => {
      expect(service.getUserId()).toEqual(null);
    });

    it('returns null for an undecodable token', () => {
      localStorage.setItem('auth_token', 'not-a-jwt');

      expect(service.getUserId()).toEqual(null);
    });
  });

  it('identifies the user by UUID on sign-in', async () => {
    invoke.mockResolvedValue(
      authResponse(jwtWith({ sub: 'account-uuid', email: 'a@example.com' })),
    );

    await firstValueFrom(service.login({ email: 'a@example.com', password: 'secret' }));

    expect(identify).toHaveBeenCalledWith('account-uuid');
  });

  it('captures a registration', async () => {
    invoke.mockResolvedValue(
      authResponse(jwtWith({ sub: 'account-uuid', email: 'a@example.com' })),
    );

    await firstValueFrom(service.register({ email: 'a@example.com', password: 'secret' }));

    expect(capture).toHaveBeenCalledWith('user_registered');
  });

  it('resets analytics on logout so the next user does not inherit the identity', () => {
    service.logout();

    expect(reset).toHaveBeenCalledTimes(1);
  });

  describe('Google OAuth redirect flow', () => {
    it('builds a Google authorization URL with the code-flow parameters', () => {
      const url = new URL(service.buildGoogleAuthUrl('state-xyz'));

      expect(url.origin + url.pathname).toEqual('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('response_type')).toEqual('code');
      expect(url.searchParams.get('scope')).toEqual('openid email profile');
      expect(url.searchParams.get('state')).toEqual('state-xyz');
      expect(url.searchParams.get('prompt')).toEqual('select_account');
      expect(url.searchParams.get('client_id')).toEqual(environment.googleClientId);
      expect(url.searchParams.get('redirect_uri')).toContain('/auth/google/callback');
    });

    it('rejects a mismatched state without calling the API', async () => {
      sessionStorage.setItem('google_oauth_state', 'expected');

      await expect(
        firstValueFrom(service.completeGoogleLogin('auth-code', 'tampered')),
      ).rejects.toThrow();
      expect(invoke).not.toHaveBeenCalled();
    });

    it('exchanges the code and stores tokens when the state matches', async () => {
      sessionStorage.setItem('google_oauth_state', 'match');
      invoke.mockResolvedValue(
        authResponse(jwtWith({ sub: 'account-uuid', email: 'g@example.com' })),
      );

      await firstValueFrom(service.completeGoogleLogin('auth-code', 'match'));

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(identify).toHaveBeenCalledWith('account-uuid');
      expect(localStorage.getItem('auth_token')).not.toEqual(null);
      // The one-time state is consumed so it can't be replayed.
      expect(sessionStorage.getItem('google_oauth_state')).toEqual(null);
    });
  });
});
