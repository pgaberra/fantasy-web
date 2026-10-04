import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockBuilder } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AnalyticsService } from './analytics.service';
import { Api } from '../api/api';
import { logout as logoutRequest } from '../api/fn/authentication/logout';
import { refresh as refreshRequest } from '../api/fn/authentication/refresh';
import { signOutEverywhere as signOutEverywhereRequest } from '../api/fn/account/sign-out-everywhere';
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
  /** What the router would say the visitor is looking at when their session runs out. */
  let currentUrl = '/projections/abc123/draft';

  const buildService = async (platform: 'browser' | 'server' = 'browser') => {
    await MockBuilder(AuthService)
      .provide({ provide: Api, useValue: { invoke } })
      .provide({
        provide: Router,
        useValue: {
          navigate: vi.fn(),
          navigateByUrl: vi.fn(),
          // A getter, so a test can move the visitor after the mock is built.
          get url() {
            return currentUrl;
          },
        },
      })
      .provide({ provide: AnalyticsService, useValue: { identify, reset, capture } })
      .provide({ provide: PLATFORM_ID, useValue: platform });

    return TestBed.inject(AuthService);
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    identify.mockClear();
    reset.mockClear();
    capture.mockClear();
    invoke.mockReset();
    // Signing out fires its request and forgets it, so every call needs something to answer.
    invoke.mockResolvedValue(undefined);
    currentUrl = '/projections/abc123/draft';

    service = await buildService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('where signing in lands', () => {
    const signIn = async () => {
      invoke.mockReturnValue(Promise.resolve(authResponse(jwtWith({ sub: 'account-uuid' }))));
      await firstValueFrom(service.login({ email: 'a@example.test', password: 'secret' }));
      return TestBed.inject(Router);
    };

    it('goes home when nothing asked for somewhere else', async () => {
      const router = await signIn();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    });

    it('goes back to the page that sent them, once', async () => {
      service.rememberReturnUrl('/s/abc123');
      const router = await signIn();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/s/abc123');

      // Spent on arrival: the next sign-in this session is not still headed for that share.
      invoke.mockReturnValue(Promise.resolve(authResponse(jwtWith({ sub: 'account-uuid' }))));
      await firstValueFrom(service.login({ email: 'a@example.test', password: 'secret' }));
      expect(router.navigateByUrl).toHaveBeenLastCalledWith('/home');
    });

    /**
     * Reaching a form with nothing asked for is reaching it from somewhere that does not want
     * them back: the nav, a guard, a bookmark. A value left from an earlier visit would send them
     * to a page they asked for in another life, and carry out the action it had on it.
     */
    it('forgets where they were headed when they arrive without a destination', async () => {
      service.rememberReturnUrl('/s/abc123?action=draft');
      service.rememberReturnUrl(null);
      const router = await signIn();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    });

    it('forgets it for a destination it would refuse anyway', async () => {
      service.rememberReturnUrl('/s/abc123');
      service.rememberReturnUrl('https://evil.example/steal');
      const router = await signIn();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    });

    /** The value arrives in a query parameter, so a link could otherwise aim it off-site. */
    it.each(['https://evil.example/steal', '//evil.example/steal', 'evil.example'])(
      'refuses to be sent to %s',
      async (elsewhere) => {
        service.rememberReturnUrl(elsewhere);
        const router = await signIn();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
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
   * A page that fires several calls just after the access token expires gets a 401 on each.
   * One refresh answers all of them, and the next expiry starts a fresh one.
   */
  describe('refreshing the session', () => {
    it('sends one refresh for callers that arrive while it is in flight', async () => {
      localStorage.setItem('refresh_token', 'refresh-token');
      let answer!: (response: AuthResponse) => void;
      invoke.mockReturnValue(
        new Promise<AuthResponse>((resolve) => {
          answer = resolve;
        }),
      );

      const first = firstValueFrom(service.refresh());
      const second = firstValueFrom(service.refresh());
      answer(authResponse(jwtWith({ sub: 'account-uuid' })));

      expect(await first).toEqual(await second);
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('starts a new refresh once the last one has answered', async () => {
      localStorage.setItem('refresh_token', 'refresh-token');
      invoke.mockImplementation(() => Promise.resolve(authResponse(jwtWith({ sub: 'a' }))));

      await firstValueFrom(service.refresh());
      await firstValueFrom(service.refresh());

      expect(invoke).toHaveBeenCalledTimes(2);
    });

    it('starts a new refresh after one that failed', async () => {
      localStorage.setItem('refresh_token', 'refresh-token');
      invoke.mockReturnValueOnce(Promise.reject(new Error('network down')));
      invoke.mockReturnValueOnce(Promise.resolve(authResponse(jwtWith({ sub: 'a' }))));

      await expect(firstValueFrom(service.refresh())).rejects.toBeTruthy();
      // A failed refresh says nothing about the token, so the second still has it to send.
      expect(localStorage.getItem('refresh_token')).toEqual('refresh-token');
      await firstValueFrom(service.refresh());

      expect(invoke).toHaveBeenCalledTimes(2);
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

  /**
   * Leaving on purpose and being thrown out mid-page are different endings. The first is where
   * the visitor meant to go; the second interrupted them, and what they were reading is what
   * they want back.
   */
  describe('ending a session', () => {
    it('sends someone who signed out to the form and nowhere after it', () => {
      service.logout();

      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    });

    /** The cookie is out of script's reach; left set, the next page load would sign them in. */
    it('asks the server to clear the refresh cookie when signing out', () => {
      service.logout();

      expect(invoke).toHaveBeenCalledWith(logoutRequest);
    });

    it('signs out here even when the server cannot be reached', async () => {
      invoke.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
      localStorage.setItem('auth_token', 'a-token');

      service.logout();
      await Promise.resolve();

      expect(localStorage.getItem('auth_token')).toEqual(null);
      expect(service.isLoggedIn()).toEqual(false);
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    });

    it('keeps the page a session ran out under', () => {
      service.endExpiredSession();

      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/projections/abc123/draft' },
      });
    });

    it('revokes every session before signing out here', async () => {
      invoke.mockResolvedValue(undefined);
      localStorage.setItem('auth_token', 'a-token');

      await firstValueFrom(service.signOutEverywhere(), { defaultValue: undefined });

      expect(invoke.mock.calls.map(([fn]) => fn)).toEqual([
        signOutEverywhereRequest,
        logoutRequest,
      ]);
      expect(localStorage.getItem('auth_token')).toEqual(null);
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    });

    it('keeps this session when the revoke fails, since nothing was revoked', async () => {
      invoke.mockRejectedValue(new Error('offline'));
      localStorage.setItem('auth_token', 'a-token');

      await expect(firstValueFrom(service.signOutEverywhere())).rejects.toThrow('offline');

      expect(localStorage.getItem('auth_token')).toEqual('a-token');
    });

    it('clears the session either way', () => {
      localStorage.setItem('auth_token', 'a-token');

      service.endExpiredSession();

      expect(localStorage.getItem('auth_token')).toEqual(null);
      expect(service.isLoggedIn()).toEqual(false);
      expect(reset).toHaveBeenCalledTimes(1);
    });

    /** Coming back to the form they were already on is a loop, not a return. */
    it.each(['/login', '/login?returnUrl=%2Fs%2Fabc', '/register', '/auth/google/callback?code=x'])(
      'does not try to send them back to %s',
      (page) => {
        currentUrl = page;

        service.endExpiredSession();

        expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
      },
    );
  });

  /**
   * The refresh token lives in an HttpOnly cookie the BFF sets: Safari deletes localStorage after
   * seven days without a visit, which made a 30-day session a 7-day one for weekly visitors.
   */
  describe('keeping the refresh token out of localStorage', () => {
    it('does not store the refresh token a sign-in returns', async () => {
      invoke.mockResolvedValue(authResponse(jwtWith({ sub: 'account-uuid' })));

      await firstValueFrom(service.login({ email: 'a@example.test', password: 'secret' }));

      expect(localStorage.getItem('refresh_token')).toEqual(null);
      expect(localStorage.getItem('auth_token')).not.toEqual(null);
    });

    it('refreshes on the cookie alone, with no body', async () => {
      invoke.mockResolvedValue(authResponse(jwtWith({ sub: 'account-uuid' })));

      await firstValueFrom(service.refresh());

      expect(invoke).toHaveBeenCalledWith(refreshRequest);
    });

    /** Whoever was signed in before the release must not be signed out by it. */
    it('sends a token stored before the cookie once, then lets the cookie carry it', async () => {
      localStorage.setItem('refresh_token', 'legacy-refresh');
      invoke.mockResolvedValue(authResponse(jwtWith({ sub: 'account-uuid' })));

      await firstValueFrom(service.refresh());
      await firstValueFrom(service.refresh());

      expect(invoke.mock.calls).toEqual([
        [refreshRequest, { body: { refreshToken: 'legacy-refresh' } }],
        [refreshRequest],
      ]);
      expect(localStorage.getItem('refresh_token')).toEqual(null);
    });

    it('drops a token stored before the cookie when signing in', async () => {
      localStorage.setItem('refresh_token', 'legacy-refresh');
      invoke.mockResolvedValue(authResponse(jwtWith({ sub: 'account-uuid' })));

      await firstValueFrom(service.login({ email: 'a@example.test', password: 'secret' }));

      expect(localStorage.getItem('refresh_token')).toEqual(null);
    });

    it('drops a token stored before the cookie when signing out', () => {
      localStorage.setItem('refresh_token', 'legacy-refresh');

      service.logout();

      expect(localStorage.getItem('refresh_token')).toEqual(null);
    });
  });

  /**
   * A browser with no access token may still hold the refresh cookie, and one refresh as the page
   * loads finds out. Every outcome but a session found must look exactly like signed out did.
   */
  describe('restoring the session as the page loads', () => {
    it('signs the visitor back in from the cookie without going anywhere', async () => {
      invoke.mockResolvedValue(authResponse(jwtWith({ sub: 'account-uuid' })));

      await service.restoreSession();

      expect(invoke).toHaveBeenCalledWith(refreshRequest);
      expect(service.isLoggedIn()).toEqual(true);
      expect(localStorage.getItem('auth_token')).not.toEqual(null);
      expect(identify).toHaveBeenCalledWith('account-uuid');
      const router = TestBed.inject(Router);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('treats a refused cookie as a visitor who is not signed in, and says nothing', async () => {
      invoke.mockRejectedValue(new HttpErrorResponse({ status: 401 }));

      await service.restoreSession();

      expect(service.isLoggedIn()).toEqual(false);
      expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
    });

    it('drops a stored token the server refused, since it will be refused again', async () => {
      localStorage.setItem('refresh_token', 'legacy-refresh');
      invoke.mockRejectedValue(new HttpErrorResponse({ status: 401 }));

      await service.restoreSession();

      expect(invoke).toHaveBeenCalledWith(refreshRequest, {
        body: { refreshToken: 'legacy-refresh' },
      });
      expect(localStorage.getItem('refresh_token')).toEqual(null);
    });

    /** A failed request says nothing about the session, so nothing stored is touched. */
    it.each([0, 503])(
      'reads a %i as signed out for this page load and keeps what is stored',
      async (status) => {
        localStorage.setItem('refresh_token', 'legacy-refresh');
        invoke.mockRejectedValue(new HttpErrorResponse({ status }));

        await service.restoreSession();

        expect(service.isLoggedIn()).toEqual(false);
        expect(localStorage.getItem('refresh_token')).toEqual('legacy-refresh');
        expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
      },
    );

    it('asks once per page load', async () => {
      invoke.mockRejectedValue(new HttpErrorResponse({ status: 401 }));

      await service.restoreSession();
      await service.restoreSession();

      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('asks nothing of a browser that already holds an access token', async () => {
      localStorage.setItem('auth_token', 'a-token');

      await service.restoreSession();

      expect(invoke).not.toHaveBeenCalled();
    });

    it('shares the refresh a 401 started rather than sending a second', async () => {
      let answer!: (response: AuthResponse) => void;
      invoke.mockReturnValue(
        new Promise<AuthResponse>((resolve) => {
          answer = resolve;
        }),
      );

      const interceptorRefresh = firstValueFrom(service.refresh());
      const restored = service.restoreSession();
      answer(authResponse(jwtWith({ sub: 'account-uuid' })));
      await Promise.all([interceptorRefresh, restored]);

      expect(invoke).toHaveBeenCalledTimes(1);
    });

    /** A hung server must not hold the landing page for the 60 s write timeout. */
    it('stops waiting on a server that never answers, and still signs in if it does', async () => {
      vi.useFakeTimers();
      let answer!: (response: AuthResponse) => void;
      invoke.mockReturnValue(
        new Promise<AuthResponse>((resolve) => {
          answer = resolve;
        }),
      );

      const restored = service.restoreSession();
      await vi.advanceTimersByTimeAsync(5000);
      await restored;

      expect(service.isLoggedIn()).toEqual(false);

      answer(authResponse(jwtWith({ sub: 'account-uuid' })));
      await vi.advanceTimersByTimeAsync(0);

      expect(service.isLoggedIn()).toEqual(true);
    });

    it('asks nothing while a page is prerendered, where there is no visitor', async () => {
      TestBed.resetTestingModule();
      const prerendering = await buildService('server');

      await prerendering.restoreSession();

      expect(invoke).not.toHaveBeenCalled();
      expect(prerendering.isLoggedIn()).toEqual(false);
    });
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
