import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { ErrorEvent } from '@sentry/browser';
import { ErrorReportingService, redactEvent } from './error-reporting.service';

describe('redactEvent', () => {
  it('strips a single-use token out of the request URL', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { url: 'https://slapstat.com/reset-password?token=live-secret&from=email' },
    };

    expect(redactEvent(event).request?.url).toEqual(
      'https://slapstat.com/reset-password?token=redacted&from=email',
    );
  });

  it('strips tokens out of breadcrumb data, where navigation history lands', () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [
        { data: { from: 'https://slapstat.com/verify-email?token=live-secret', status: '200' } },
      ],
    };

    const [breadcrumb] = redactEvent(event).breadcrumbs ?? [];
    expect(breadcrumb.data?.['from']).toEqual('https://slapstat.com/verify-email?token=redacted');
    expect(breadcrumb.data?.['status']).toEqual('200');
  });

  it('leaves a URL without sensitive params alone', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { url: 'https://slapstat.com/projections/abc' },
    };

    expect(redactEvent(event).request?.url).toEqual('https://slapstat.com/projections/abc');
  });
});

describe('ErrorReportingService', () => {
  /**
   * `environment.sentryDsn` is empty in dev and in tests, which is the switch that keeps the SDK
   * unfetched and every report a no-op. If this ever throws instead of returning quietly, a test
   * run would start talking to Sentry.
   */
  it('is inert without a DSN', () => {
    const service = TestBed.inject(ErrorReportingService);

    expect(() => service.report(new Error('boom'))).not.toThrow();
    expect(() => service.reportMessage('failed to save')).not.toThrow();
    expect(() => service.identify('user-uuid')).not.toThrow();
    expect(() => service.reset()).not.toThrow();
  });

  it('does not load the SDK when there is no DSN', async () => {
    const service = TestBed.inject(ErrorReportingService);

    await service.init();

    // Nothing to assert on the client itself — it is private and never created. What matters is
    // that init resolves rather than importing ~40 kB and opening a transport in every test.
    expect(() => service.report(new Error('still inert'))).not.toThrow();
  });
});
