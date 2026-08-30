import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const isAuthEndpoint = req.url.includes('/api/v1/auth/');
  const token = authService.getToken();
  const authReq =
    token && !isAuthEndpoint
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized;

      if (!isUnauthorized || isAuthEndpoint) {
        return throwError(() => error);
      }

      const refreshToken = authService.getRefreshToken();

      // A visitor who never signed in has no session to end, and ending one navigates to
      // /login. Without this, a public page whose data happens to need auth ejected the
      // reader to the sign-in form instead of letting the page show its own error state.
      // The 401 still propagates — the caller decides what to say about it.
      if (!token && !refreshToken) {
        return throwError(() => error);
      }

      if (!refreshToken) {
        authService.endExpiredSession();
        return throwError(() => error);
      }

      return authService.refresh().pipe(
        switchMap((response) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${response.token}` } })),
        ),
        catchError((refreshError: unknown) => {
          authService.endExpiredSession();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
