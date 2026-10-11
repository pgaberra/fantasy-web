import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpStatusCode,
} from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Only the refresh endpoint's own refusal proves the refresh token is dead. A dropped connection
 * (status 0, which is also what an edge 429 without CORS headers looks like), a 5xx or a gateway
 * error says nothing about the token, and ending the session for one deleted a refresh token that
 * was good for weeks — the next page load then had nothing to recover with.
 */
function refreshTokenRejected(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === HttpStatusCode.Unauthorized || error.status === HttpStatusCode.Forbidden)
  );
}

/**
 * The bearer token on an API call; credentials on an auth call. The refresh token is an HttpOnly
 * cookie the BFF sets on its auth responses, and the API is on another origin, so without
 * credentials the browser neither keeps that cookie nor sends it back. No other call needs it,
 * and the cookie's path keeps it to the auth endpoints anyway.
 */
function withSession(
  req: HttpRequest<unknown>,
  token: string | null,
  isAuthEndpoint: boolean,
): HttpRequest<unknown> {
  if (isAuthEndpoint) {
    return req.clone({ withCredentials: true });
  }
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const isAuthEndpoint = req.url.includes('/api/v1/auth/');
  const token = authService.getToken();
  const authReq = withSession(req, token, isAuthEndpoint);

  return next(authReq).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized;

      if (!isUnauthorized || isAuthEndpoint) {
        return throwError(() => error);
      }

      // A visitor who is not signed in has no session to end, and ending one navigates to
      // /login. Without this, a public page whose data happens to need auth ejected the
      // reader to the sign-in form instead of letting the page show its own error state.
      // The 401 still propagates — the caller decides what to say about it. Whether a refresh
      // cookie could have signed them in was already asked once, as the page loaded
      // (`AuthService.restoreSession`).
      if (!token) {
        return throwError(() => error);
      }

      return authService.refresh().pipe(
        // Scoped to the refresh alone, ahead of the retry: a 403 or a 5xx from the retried
        // request is that request's own answer and must not end a session that just refreshed.
        catchError((refreshError: unknown) => {
          if (refreshTokenRejected(refreshError)) {
            authService.endExpiredSession();
          }
          // Otherwise the tokens stay, the original call fails into its own error state with the
          // refresh's error (so "can't reach the server" rather than "sign in"), and the next
          // call tries to refresh again.
          return throwError(() => refreshError);
        }),
        switchMap((response) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${response.token}` } })),
        ),
      );
    }),
  );
};
