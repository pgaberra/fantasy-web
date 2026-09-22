import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { FAILURE_ON_OUR_SIDE_MESSAGE, RequestTimeoutError } from '../shared/http-error';
import { leagueSummaryMessage, leagueSummaryRetryable } from './league-summary-error';

const refusal = (status: number) => new HttpErrorResponse({ status });

describe('league summary failures', () => {
  /**
   * The case this exists for. The endpoint was refused by the server's own configuration and the
   * page told its reader to check their connection, which sent them looking in the one place the
   * fault could not be.
   */
  it('owns a refusal the reader cannot do anything about', () => {
    expect(leagueSummaryMessage(refusal(403))).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
    expect(leagueSummaryMessage(refusal(400))).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
    expect(leagueSummaryMessage(refusal(500))).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
    expect(leagueSummaryRetryable(refusal(403))).toBe(false);
  });

  it('names the move where the reader has one', () => {
    expect(leagueSummaryMessage(refusal(401))).toContain('Sign in again');
    expect(leagueSummaryMessage(refusal(404))).toContain('Yahoo account');
    expect(leagueSummaryMessage(refusal(424))).toContain('Reconnect');
    expect(leagueSummaryMessage(refusal(429))).toContain('Wait a minute');
  });

  it('blames nobody in particular when the server was never reached', () => {
    expect(leagueSummaryMessage(refusal(0))).toContain("can't reach the server");
    expect(leagueSummaryMessage(new RequestTimeoutError('GET', '/x', 1000))).toEqual(
      FAILURE_ON_OUR_SIDE_MESSAGE,
    );
  });

  /** A button that answers the same way every time is worse than no button. */
  it('offers another try only where one could answer differently', () => {
    expect(leagueSummaryRetryable(refusal(401))).toBe(false);
    expect(leagueSummaryRetryable(refusal(404))).toBe(false);
    expect(leagueSummaryRetryable(refusal(424))).toBe(true);
    expect(leagueSummaryRetryable(refusal(429))).toBe(true);
    expect(leagueSummaryRetryable(refusal(503))).toBe(true);
    expect(leagueSummaryRetryable(null)).toBe(true);
  });
});
