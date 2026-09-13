import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import {
  isConnectivityError,
  isFailureOnOurSide,
  messageForError,
  RequestTimeoutError,
  SERVER_UNREACHABLE_MESSAGE,
} from './http-error';

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

    it('treats a request the server never answered as a connectivity error', () => {
      expect(isConnectivityError(new RequestTimeoutError('GET', '/x', 20_000))).toEqual(true);
    });
  });

  describe('isFailureOnOurSide', () => {
    it.each([500, 502, 503, 504])('puts a %i on our side', (status) => {
      expect(isFailureOnOurSide(new HttpErrorResponse({ status }), true)).toEqual(true);
    });

    it('puts a timeout on our side', () => {
      expect(isFailureOnOurSide(new RequestTimeoutError('GET', '/x', 20_000), true)).toEqual(true);
    });

    // A proxy with no server behind it answers without CORS headers, so the browser reports 0.
    it('puts a status 0 on our side while the browser is online', () => {
      expect(isFailureOnOurSide(new HttpErrorResponse({ status: 0 }), true)).toEqual(true);
    });

    it('leaves a status 0 with the connection while the browser is offline', () => {
      expect(isFailureOnOurSide(new HttpErrorResponse({ status: 0 }), false)).toEqual(false);
    });

    it.each([400, 401, 403, 404, 409])('does not put a %i on our side', (status) => {
      expect(isFailureOnOurSide(new HttpErrorResponse({ status }), true)).toEqual(false);
    });

    it('does not put a missing or non-HTTP error on our side', () => {
      expect(isFailureOnOurSide(undefined, true)).toEqual(false);
      expect(isFailureOnOurSide(new Error('boom'), true)).toEqual(false);
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
