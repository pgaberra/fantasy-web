import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

export const TRANSIENT_STATUSES = [0, 502, 503, 504];
// A couple of quick retries smooth over a momentary gateway/connection blip (a brief
// reverse-proxy reload, a dropped keep-alive) so a single hiccup doesn't surface as an
// error. This is a small safety net, not a cold-start workaround: it deliberately does
// NOT try to ride out a full service restart — that is the job of zero-downtime deploys.
export const MAX_RETRIES = 2;
const MAX_DELAY_MS = 1000;

export function isTransientError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && TRANSIENT_STATUSES.includes(error.status);
}

export function retryBackoffMs(retryCount: number): number {
  return Math.min(MAX_DELAY_MS, 250 * 2 ** (retryCount - 1));
}

export const retryInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    retry({
      count: MAX_RETRIES,
      delay: (error: unknown, retryCount) =>
        isTransientError(error) ? timer(retryBackoffMs(retryCount)) : throwError(() => error),
    }),
  );
