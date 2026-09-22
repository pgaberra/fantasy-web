import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { FAILURE_ON_OUR_SIDE_MESSAGE, RequestTimeoutError } from '../shared/http-error';
import { powerRankingsMessage, powerRankingsRetryable } from './power-rankings-error';

const refusal = (status: number) => new HttpErrorResponse({ status });

describe('power rankings failures', () => {
  /**
   * The case this exists for. The endpoint was refused by the server's own configuration and the
   * page told its reader to check their connection, which sent them looking in the one place the
   * fault could not be.
   */
  it('owns a refusal the reader cannot do anything about', () => {
    expect(powerRankingsMessage(refusal(403))).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
    expect(powerRankingsMessage(refusal(400))).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
    expect(powerRankingsMessage(refusal(500))).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
    expect(powerRankingsRetryable(refusal(403))).toBe(false);
  });

  it('names the move where the reader has one', () => {
    expect(powerRankingsMessage(refusal(401))).toContain('Sign in again');
    expect(powerRankingsMessage(refusal(404))).toContain('Yahoo account');
    expect(powerRankingsMessage(refusal(424))).toContain('Reconnect');
    expect(powerRankingsMessage(refusal(429))).toContain('Wait a minute');
  });

  it('blames nobody in particular when the server was never reached', () => {
    expect(powerRankingsMessage(refusal(0))).toContain("can't reach the server");
    expect(powerRankingsMessage(new RequestTimeoutError('GET', '/x', 1000))).toEqual(
      FAILURE_ON_OUR_SIDE_MESSAGE,
    );
  });

  /** A button that answers the same way every time is worse than no button. */
  it('offers another try only where one could answer differently', () => {
    expect(powerRankingsRetryable(refusal(401))).toBe(false);
    expect(powerRankingsRetryable(refusal(404))).toBe(false);
    expect(powerRankingsRetryable(refusal(424))).toBe(true);
    expect(powerRankingsRetryable(refusal(429))).toBe(true);
    expect(powerRankingsRetryable(refusal(503))).toBe(true);
    expect(powerRankingsRetryable(null)).toBe(true);
  });
});
