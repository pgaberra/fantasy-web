import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

export const TRANSIENT_STATUSES = [0, 502, 503, 504];
export const MAX_RETRIES = 10;
const MAX_DELAY_MS = 10000;

export function isTransientError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && TRANSIENT_STATUSES.includes(error.status);
}

export function retryBackoffMs(retryCount: number): number {
  return Math.min(MAX_DELAY_MS, 1000 * 2 ** (retryCount - 1));
}

export const retryInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    retry({
      count: MAX_RETRIES,
      delay: (error, retryCount) =>
        isTransientError(error) ? timer(retryBackoffMs(retryCount)) : throwError(() => error),
    }),
  );
