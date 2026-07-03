import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { isConnectivityError, messageForError, SERVER_UNREACHABLE_MESSAGE } from './http-error';

describe('http-error', () => {
  describe('isConnectivityError', () => {
    it('treats a status 0 (no network / server unreachable) as a connectivity error', () => {
      expect(isConnectivityError(new HttpErrorResponse({ status: 0 }))).toEqual(true);
    });

    it('treats any 5xx as a connectivity error', () => {
      expect(isConnectivityError(new HttpErrorResponse({ status: 500 }))).toEqual(true);
      expect(isConnectivityError(new HttpErrorResponse({ status: 502 }))).toEqual(true);
      expect(isConnectivityError(new HttpErrorResponse({ status: 503 }))).toEqual(true);
    });

    it('does not treat a 4xx as a connectivity error', () => {
      expect(isConnectivityError(new HttpErrorResponse({ status: 401 }))).toEqual(false);
      expect(isConnectivityError(new HttpErrorResponse({ status: 409 }))).toEqual(false);
    });

    it('does not treat a non-HTTP error as a connectivity error', () => {
      expect(isConnectivityError(new Error('boom'))).toEqual(false);
      expect(isConnectivityError(null)).toEqual(false);
    });
  });

  describe('messageForError', () => {
    it('returns the server-unreachable message for connectivity errors', () => {
      expect(messageForError(new HttpErrorResponse({ status: 0 }), 'cause')).toEqual(
        SERVER_UNREACHABLE_MESSAGE,
      );
    });

    it('returns the cause-specific message for other errors', () => {
      expect(messageForError(new HttpErrorResponse({ status: 401 }), 'Bad credentials')).toEqual(
        'Bad credentials',
      );
    });
  });
});
