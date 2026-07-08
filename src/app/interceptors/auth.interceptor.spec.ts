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
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      getToken: vi.fn(),
      getRefreshToken: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
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

  it('logs out when the refresh attempt fails', async () => {
    authService.getToken.mockReturnValue('stale');
    authService.getRefreshToken.mockReturnValue('refresh');
    authService.refresh.mockReturnValue(unauthorized());
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

    await expect(run(new HttpRequest('GET', '/api/v1/players/skaters'), next)).rejects.toBeTruthy();

    expect(authService.refresh).toHaveBeenCalledTimes(1);
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('logs out without refreshing when there is no refresh token', async () => {
    authService.getToken.mockReturnValue('stale');
    authService.getRefreshToken.mockReturnValue(null);
    const next = vi.fn<HttpHandlerFn>().mockReturnValue(unauthorized());

    await expect(run(new HttpRequest('GET', '/api/v1/players/skaters'), next)).rejects.toBeTruthy();

    expect(authService.refresh).not.toHaveBeenCalled();
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });
});
