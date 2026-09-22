import { HttpErrorResponse } from '@angular/common/http';
import { FAILURE_ON_OUR_SIDE_MESSAGE, SERVER_UNREACHABLE_MESSAGE } from '../shared/http-error';

/**
 * What a failed read of a league says to the reader.
 *
 * <p>Written as a map rather than a default, because the default was wrong in the one case that
 * happened: the endpoint was refused by the server's own configuration and the page told its
 * reader to check their connection. A refusal we caused is ours to own, and an answer the reader
 * can do something about has to say what.
 */
export function powerRankingsMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    // A request that got no answer at all: the timeout interceptor's, and ours.
    return FAILURE_ON_OUR_SIDE_MESSAGE;
  }
  switch (error.status) {
    case 0:
      // The browser could not reach us. Which of us is offline is not knowable from here, and
      // the error state says so in the reader's own terms when the browser knows it is online.
      return SERVER_UNREACHABLE_MESSAGE;
    case 401:
      return 'Your session has ended. Sign in again to read this league.';
    case 404:
      return "This league can't be read here. Check that your Yahoo account is still connected.";
    case 424:
      return 'Yahoo refused access to this league. Reconnect your Yahoo account and try again.';
    case 429:
      return "That's a lot of reading at once. Wait a minute and try again.";
    default:
      // Every other refusal is a fault on our side, including the 403 that started this: the
      // reader's connection has nothing to do with it, and neither has their account.
      return FAILURE_ON_OUR_SIDE_MESSAGE;
  }
}

/**
 * Whether pressing the button again could plausibly answer differently. A refusal that will be
 * repeated word for word gets no button — the reader's next move is elsewhere.
 */
export function powerRankingsRetryable(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return true;
  }
  return error.status !== 401 && error.status !== 403 && error.status !== 404;
}
