import { HttpErrorResponse } from '@angular/common/http';

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

/**
 * What the BFF answers when Yahoo itself refused the request: 424 with code
 * `YAHOO_ACCESS_DENIED`, and Yahoo's own sentence as the message.
 *
 * A refusal holds until Yahoo changes its mind, so "please try again" is the wrong thing to say
 * over it. From 2026-08-26 until Yahoo restored the app's access it arrived as a 502 and every
 * screen blamed a connection problem instead.
 *
 * @returns Yahoo's sentence, an empty string for a refusal that carried none, or null when the
 *   error is not a Yahoo refusal at all.
 */
export function yahooRefusalMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 424) {
    return null;
  }
  const body = error.error as ErrorBody | null;
  if (body?.code !== 'YAHOO_ACCESS_DENIED') {
    return null;
  }
  return typeof body.message === 'string' ? body.message : '';
}

export function isYahooRefusal(error: unknown): boolean {
  return yahooRefusalMessage(error) !== null;
}
