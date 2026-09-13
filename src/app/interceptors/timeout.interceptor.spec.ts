import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestTimeoutError } from '../shared/http-error';
import { isTransientError, retryInterceptor } from './retry.interceptor';
import {
  READ_TIMEOUT_MS,
  timeoutInterceptor,
  timeoutMsFor,
  WRITE_TIMEOUT_MS,
} from './timeout.interceptor';

describe('timeoutInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([retryInterceptor, timeoutInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('fails a read the server never answers, once the read timeout has passed', () => {
    let error: unknown;
    http.get('/api/v1/projections').subscribe({ error: (e: unknown) => (error = e) });
    const request = backend.expectOne('/api/v1/projections');

    vi.advanceTimersByTime(READ_TIMEOUT_MS - 1);
    expect(error).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(request.cancelled).toBe(true);
  });

  it('does not retry a timed-out request', () => {
    http.get('/api/v1/projections').subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/projections');

    vi.advanceTimersByTime(READ_TIMEOUT_MS + 5_000);

    expect(backend.match('/api/v1/projections')).toHaveLength(0);
  });

  it('lets an answer that arrives before the timeout through', () => {
    let body: unknown;
    http.get('/api/v1/projections').subscribe((value) => (body = value));
    const request = backend.expectOne('/api/v1/projections');

    vi.advanceTimersByTime(READ_TIMEOUT_MS - 1);
    request.flush([]);

    expect(body).toEqual([]);
  });

  it('gives a write the longer timeout', () => {
    let error: unknown;
    http.put('/api/v1/projections/1', {}).subscribe({ error: (e: unknown) => (error = e) });
    backend.expectOne('/api/v1/projections/1');

    vi.advanceTimersByTime(READ_TIMEOUT_MS);
    expect(error).toBeUndefined();

    vi.advanceTimersByTime(WRITE_TIMEOUT_MS - READ_TIMEOUT_MS);
    expect(error).toBeInstanceOf(RequestTimeoutError);
  });

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('gives %s the read timeout', (method) => {
    expect(timeoutMsFor(method)).toEqual(READ_TIMEOUT_MS);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('gives %s the write timeout', (method) => {
    expect(timeoutMsFor(method)).toEqual(WRITE_TIMEOUT_MS);
  });

  it('is not a transient error to the retry interceptor', () => {
    expect(isTransientError(new RequestTimeoutError('GET', '/x', READ_TIMEOUT_MS), 'GET')).toBe(
      false,
    );
  });
});
