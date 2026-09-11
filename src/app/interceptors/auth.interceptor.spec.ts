import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { AuthResponse } from '../api/models';

describe('authInterceptor', () => {
  const tokens: AuthResponse = {
    token: 'new-access',
    refreshToken: 'new-refresh',
    expiresInSeconds: 900,
    refreshExpiresInSeconds: 2592000,
    admin: false,
    emailVerified: true,
  };

  let authService: {
    getToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    endExpiredSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      getToken: vi.fn(),
      getRefreshToken: vi.fn(),
      refresh: vi.fn(),
      endExpiredSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authService }],
    });
  });

  const run = (req: HttpRequest<unknown>, next: HttpHandlerFn) =>
    lastValueFrom(TestBed.runInInjectionContext(() => authInterceptor(req, next)));

  const unauthorized = () => throwError(() => new HttpErrorResponse({ status: 401 }));

  it('attaches the bearer token to non-auth requests', async () => {
    authService.getToken.mockReturnValue('access');
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(of(new HttpResponse()));

    await run(new HttpRequest('GET', '/api/v1/players/skaters'), next);

    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toEqual('Bearer access');
  });

  it('does not attach the token to auth requests', async () => {
    authService.getToken.mockReturnValue('access');
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(of(new HttpResponse()));

    await run(new HttpRequest('POST', '/api/v1/auth/refresh', {}), next);

    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toBeNull();
  });

  it('refreshes once and retries the original request on 401', async () => {
    authService.getToken.mockReturnValue('stale');
    authService.getRefreshToken.mockReturnValue('refresh');
    authService.refresh.mockReturnValue(of(tokens));
    const next = vi
      .fn<HttpHandlerFn>()
      .mockReturnValueOnce(unauthorized())
      .mockReturnValueOnce(of(new HttpResponse({ status: 200 })));

    await run(new HttpRequest('GET', '/api/v1/players/skaters'), next);

    expect(authService.refresh).toHaveBeenCalledTimes(1);
    const retried = next.mock.calls[1][0];
    expect(retried.headers.get('Authorization')).toEqual('Bearer new-access');
  });

  it('does not attempt a refresh when the refresh endpoint itself returns 401', async () => {
    authService.getRefreshToken.mockReturnValue('refresh');
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

    await expect(
      run(new HttpRequest('POST', '/api/v1/auth/refresh', {}), next),
    ).rejects.toBeTruthy();

    expect(authService.refresh).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('ends the session when the refresh itself answers %i', async (status) => {
    authService.getToken.mockReturnValue('stale');
    authService.getRefreshToken.mockReturnValue('refresh');
    authService.refresh.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

    await expect(run(new HttpRequest('GET', '/api/v1/players/skaters'), next)).rejects.toBeTruthy();

    expect(authService.refresh).toHaveBeenCalledTimes(1);
    expect(authService.endExpiredSession).toHaveBeenCalledTimes(1);
  });

  /**
   * A blip on the refresh says nothing about the refresh token. Ending the session for one
   * deleted a token good for weeks: a Wi-Fi handover, a BFF container swap or an edge 429 (which
   * the browser sees as status 0) signed the user out with nothing to recover from.
   */
  it.each([0, 500, 502, 503, 504])(
    'keeps the session when the refresh fails with status %i, and reports that failure',
    async (status) => {
      authService.getToken.mockReturnValue('stale');
      authService.getRefreshToken.mockReturnValue('refresh');
      authService.refresh.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

      const failure = await run(new HttpRequest('GET', '/api/v1/players/skaters'), next).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(HttpErrorResponse);
      expect((failure as HttpErrorResponse).status).toEqual(status);
      expect(authService.endExpiredSession).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  // The retried call's own answer (a Premium 403, a 500) belongs to that call, not to the session.
  it.each([403, 500])(
    'keeps the session when the retried request fails with %i after a good refresh',
    async (status) => {
      authService.getToken.mockReturnValue('stale');
      authService.getRefreshToken.mockReturnValue('refresh');
      authService.refresh.mockReturnValue(of(tokens));
      const next = vi
        .fn<HttpHandlerFn>()
        .mockReturnValueOnce(unauthorized())
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));

      await expect(
        run(new HttpRequest('GET', '/api/v1/players/skaters'), next),
      ).rejects.toBeTruthy();

      expect(authService.endExpiredSession).not.toHaveBeenCalled();
    },
  );

  it('ends the session without refreshing when there is no refresh token', async () => {
    authService.getToken.mockReturnValue('stale');
    authService.getRefreshToken.mockReturnValue(null);
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

    await expect(run(new HttpRequest('GET', '/api/v1/players/skaters'), next)).rejects.toBeTruthy();

    expect(authService.refresh).not.toHaveBeenCalled();
    expect(authService.endExpiredSession).toHaveBeenCalledTimes(1);
  });

  /**
   * A public page whose data turns out to need auth must be allowed to say so itself.
   * Ending a session navigates to /login, so doing it for a visitor who never signed in threw
   * them off the page they were reading — the landing demo's own error state never showed.
   */
  it('does not end a session for a visitor who was never signed in', async () => {
    authService.getToken.mockReturnValue(null);
    authService.getRefreshToken.mockReturnValue(null);
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

    await expect(run(new HttpRequest('GET', '/api/v1/players/skaters'), next)).rejects.toBeTruthy();

    expect(authService.endExpiredSession).not.toHaveBeenCalled();
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  // The access token is the half that expires; a refresh token on its own is still a session.
  it('still refreshes when only the access token is gone', async () => {
    authService.getToken.mockReturnValue(null);
    authService.getRefreshToken.mockReturnValue('refresh');
    authService.refresh.mockReturnValue(of(tokens));
    const next = vi
      .fn<HttpHandlerFn>()
      .mockReturnValueOnce(unauthorized())
      .mockReturnValueOnce(of(new HttpResponse({ status: 200 })));

    await run(new HttpRequest('GET', '/api/v1/players/skaters'), next);

    expect(authService.refresh).toHaveBeenCalledTimes(1);
    expect(authService.endExpiredSession).not.toHaveBeenCalled();
  });
});
