import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENT_METHODS,
  isTransientError,
  MAX_RETRIES,
  retryBackoffMs,
  TRANSIENT_STATUSES,
} from './retry.interceptor';

describe('retryInterceptor logic', () => {
  describe('isTransientError', () => {
    it.each(TRANSIENT_STATUSES)('treats gateway/connection status %i as transient', (status) => {
      expect(isTransientError(new HttpErrorResponse({ status }), 'GET')).toEqual(true);
    });

    it.each([400, 401, 403, 404, 409, 500])('does not treat status %i as transient', (status) => {
      expect(isTransientError(new HttpErrorResponse({ status }), 'GET')).toEqual(false);
    });

    it('does not treat a non-HTTP error as transient', () => {
      expect(isTransientError(new Error('boom'), 'GET')).toEqual(false);
    });

    it.each(IDEMPOTENT_METHODS)('retries a dropped connection on %s', (method) => {
      expect(isTransientError(new HttpErrorResponse({ status: 0 }), method)).toEqual(true);
    });

    // A dropped POST may already have been processed server-side; replaying it could create
    // a duplicate, and it re-uploads the whole body over a link that just failed.
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'does not retry a dropped connection on %s',
      (method) => {
        expect(isTransientError(new HttpErrorResponse({ status: 0 }), method)).toEqual(false);
      },
    );

    it.each([502, 503, 504])('still retries gateway status %i on a POST', (status) => {
      expect(isTransientError(new HttpErrorResponse({ status }), 'POST')).toEqual(true);
    });

    it('matches the method case-insensitively', () => {
      expect(isTransientError(new HttpErrorResponse({ status: 0 }), 'get')).toEqual(true);
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
