import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  isTransientError,
  MAX_RETRIES,
  retryBackoffMs,
  TRANSIENT_STATUSES,
} from './retry.interceptor';

describe('retryInterceptor logic', () => {
  describe('isTransientError', () => {
    it.each(TRANSIENT_STATUSES)('treats gateway/connection status %i as transient', (status) => {
      expect(isTransientError(new HttpErrorResponse({ status }))).toEqual(true);
    });

    it.each([400, 401, 403, 404, 409, 500])('does not treat status %i as transient', (status) => {
      expect(isTransientError(new HttpErrorResponse({ status }))).toEqual(false);
    });

    it('does not treat a non-HTTP error as transient', () => {
      expect(isTransientError(new Error('boom'))).toEqual(false);
    });
  });

  describe('retryBackoffMs', () => {
    it('grows exponentially from 250ms', () => {
      expect(retryBackoffMs(1)).toEqual(250);
      expect(retryBackoffMs(2)).toEqual(500);
    });

    it('caps the delay at 1s', () => {
      expect(retryBackoffMs(3)).toEqual(1000);
      expect(retryBackoffMs(MAX_RETRIES + 5)).toEqual(1000);
    });
  });

  it('keeps the total retry window short — a couple of quick attempts, not a cold-start wait', () => {
    const totalWindowMs = Array.from({ length: MAX_RETRIES }, (_, i) =>
      retryBackoffMs(i + 1),
    ).reduce((sum, ms) => sum + ms, 0);
    expect(totalWindowMs).toBeLessThanOrEqual(2000);
  });
});
