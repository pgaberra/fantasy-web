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

      if (!authService.getRefreshToken()) {
        authService.logout();
        return throwError(() => error);
      }

      return authService.refresh().pipe(
        switchMap((response) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${response.token}` } })),
        ),
        catchError((refreshError: unknown) => {
          authService.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
