import { HttpInterceptorFn } from '@angular/common/http';
import { throwError, timeout } from 'rxjs';
import { RequestTimeoutError } from '../shared/http-error';
import { IDEMPOTENT_METHODS } from './retry.interceptor';

// A server that accepts the connection and never answers raises no error at all, so without a
// bound a page waiting on it shows its loading state for as long as the tab stays open. Staging's
// BFF did exactly that for minutes on 2026-09-11.
//
// A read gets a little more than the BFF's own longest wait on a downstream service (15 s), so a
// slow answer still lands. A write gets longer, because giving up on it does not undo it: the
// server may still commit after the page has said it failed.
//
// A timeout is not retried (retryInterceptor sees no HttpErrorResponse): a server that said
// nothing for this long is not going to answer the next attempt a second later.
export const READ_TIMEOUT_MS = 20_000;
export const WRITE_TIMEOUT_MS = 60_000;

export function timeoutMsFor(method: string): number {
  return IDEMPOTENT_METHODS.includes(method.toUpperCase()) ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
}

export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
  const timeoutMs = timeoutMsFor(req.method);
  return next(req).pipe(
    timeout({
      each: timeoutMs,
      with: () => throwError(() => new RequestTimeoutError(req.method, req.url, timeoutMs)),
    }),
  );
};
