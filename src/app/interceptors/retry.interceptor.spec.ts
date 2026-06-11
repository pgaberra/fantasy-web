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
    it('grows exponentially from 1s', () => {
      expect(retryBackoffMs(1)).toEqual(1000);
      expect(retryBackoffMs(2)).toEqual(2000);
      expect(retryBackoffMs(3)).toEqual(4000);
      expect(retryBackoffMs(4)).toEqual(8000);
    });

    it('caps the delay at 10s', () => {
      expect(retryBackoffMs(5)).toEqual(10000);
      expect(retryBackoffMs(MAX_RETRIES)).toEqual(10000);
    });
  });

  it('retries over a ~200s window to cover a compounded cold start', () => {
    const totalWindowMs = Array.from({ length: MAX_RETRIES }, (_, i) =>
      retryBackoffMs(i + 1),
    ).reduce((sum, ms) => sum + ms, 0);
    expect(totalWindowMs).toBeGreaterThanOrEqual(200000);
  });
});
