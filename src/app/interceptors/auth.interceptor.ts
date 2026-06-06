import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError(error => {
      if (error.status === HttpStatusCode.Unauthorized && authService.getRefreshToken()) {
        return authService.refresh().pipe(
          switchMap(response => {
            const retryReq = req.clone({ setHeaders: { Authorization: `Bearer ${response.token}` } });
            return next(retryReq);
          }),
          catchError(refreshError => {
            authService.logout();
            return throwError(() => refreshError);
          }),
        );
      }
      if (error.status === HttpStatusCode.Unauthorized) {
        authService.logout();
      }
      return throwError(() => error);
    }),
  );
};
