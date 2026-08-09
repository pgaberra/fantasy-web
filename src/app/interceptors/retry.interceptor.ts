import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

export const TRANSIENT_STATUSES = [0, 502, 503, 504];
// Status 0 is a connection-level failure: the request never completed. That is NOT the same
// as "it never arrived" — the server may have processed it and only the response was lost.
// Replaying a POST/PUT/DELETE on that basis risks duplicating work, and for a large body it
// re-uploads everything over the link that just failed. So status 0 is retried only for
// methods that are safe to repeat; the gateway statuses are real answers and stay retryable
// for every method.
export const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS'];
// A couple of quick retries smooth over a momentary gateway/connection blip (a brief
// reverse-proxy reload, a dropped keep-alive) so a single hiccup doesn't surface as an
// error. This is a small safety net, not a cold-start workaround: it deliberately does
// NOT try to ride out a full service restart — that is the job of zero-downtime deploys.
export const MAX_RETRIES = 2;
const MAX_DELAY_MS = 1000;

export function isTransientError(error: unknown, method: string): boolean {
  if (!(error instanceof HttpErrorResponse) || !TRANSIENT_STATUSES.includes(error.status)) {
    return false;
  }
  return error.status !== 0 || IDEMPOTENT_METHODS.includes(method.toUpperCase());
}

export function retryBackoffMs(retryCount: number): number {
  return Math.min(MAX_DELAY_MS, 250 * 2 ** (retryCount - 1));
}

export const retryInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    retry({
      count: MAX_RETRIES,
      delay: (error: unknown, retryCount) =>
        isTransientError(error, req.method)
          ? timer(retryBackoffMs(retryCount))
          : throwError(() => error),
    }),
  );
