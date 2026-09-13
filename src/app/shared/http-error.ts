import { HttpErrorResponse } from '@angular/common/http';

export const SERVER_UNREACHABLE_MESSAGE =
  "We can't reach the server right now. Please try again in a moment.";

export const FAILURE_ON_OUR_SIDE_MESSAGE =
  "We're having technical problems. Try again in a few minutes.";

/** A request the server accepted and never answered; see `timeoutInterceptor`. */
export class RequestTimeoutError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`${method} ${url} got no response within ${timeoutMs} ms`);
    this.name = 'RequestTimeoutError';
  }
}

export function isConnectivityError(error: unknown): boolean {
  return (
    error instanceof RequestTimeoutError ||
    (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
  );
}

/**
 * Whether a failure is ours rather than the reader's connection. A dead backend often reaches the
 * browser as status 0 rather than a 503, because the proxy's error page carries no CORS headers,
 * so status 0 counts as ours unless the browser itself says it is offline.
 */
export function isFailureOnOurSide(error: unknown, online = navigator.onLine): boolean {
  if (error instanceof RequestTimeoutError) {
    return true;
  }
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  return error.status >= 500 || (error.status === 0 && online);
}

export function messageForError(error: unknown, causeMessage: string): string {
  return isConnectivityError(error) ? SERVER_UNREACHABLE_MESSAGE : causeMessage;
}
