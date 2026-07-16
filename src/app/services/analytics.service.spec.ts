import { TestBed } from '@angular/core/testing';
import type { CaptureResult } from 'posthog-js';
import { AnalyticsService, redactEvent } from './analytics.service';

function captureResult(properties: CaptureResult['properties']): CaptureResult {
  return { uuid: 'test-uuid', event: '$pageview', properties };
}

describe('redactEvent', () => {
  it('strips a password-reset token out of $current_url', () => {
    const event = redactEvent(
      captureResult({ $current_url: 'https://slapstat.com/reset-password?token=secret-value' }),
    );

    expect(event?.properties['$current_url']).toEqual(
      'https://slapstat.com/reset-password?token=redacted',
    );
  });

  it('strips an email-verification token out of $referrer', () => {
    const event = redactEvent(
      captureResult({ $referrer: 'https://slapstat.com/verify-email?token=secret-value' }),
    );

    expect(event?.properties['$referrer']).toEqual(
      'https://slapstat.com/verify-email?token=redacted',
    );
  });

  it('redacts any URL-bearing property, not just a known allowlist', () => {
    const event = redactEvent(
      captureResult({
        $some_future_posthog_property: 'https://slapstat.com/verify-email?token=secret-value',
      }),
    );

    expect(event?.properties['$some_future_posthog_property']).toEqual(
      'https://slapstat.com/verify-email?token=redacted',
    );
  });

  it('redacts tokens nested in $set_once, where initial URLs live', () => {
    const event = redactEvent({
      uuid: 'test-uuid',
      event: '$pageview',
      properties: {},
      $set_once: { $initial_current_url: 'https://slapstat.com/reset-password?token=secret-value' },
    });

    expect(event?.$set_once?.['$initial_current_url']).toEqual(
      'https://slapstat.com/reset-password?token=redacted',
    );
  });

  it('keeps other query parameters intact', () => {
    const event = redactEvent(
      captureResult({ $current_url: 'https://slapstat.com/?yahoo=connected&token=secret-value' }),
    );

    expect(event?.properties['$current_url']).toEqual(
      'https://slapstat.com/?yahoo=connected&token=redacted',
    );
  });

  it('leaves URLs without a token untouched', () => {
    const url = 'https://slapstat.com/projections';
    const event = redactEvent(captureResult({ $current_url: url }));

    expect(event?.properties['$current_url']).toEqual(url);
  });

  it('leaves non-URL strings untouched', () => {
    const event = redactEvent(captureResult({ $browser: 'Chrome' }));

    expect(event?.properties['$browser']).toEqual('Chrome');
  });

  it('passes a null event through, as posthog may drop it upstream', () => {
    expect(redactEvent(null)).toEqual(null);
  });
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AnalyticsService);
  });

  // environment.posthogKey is '' in tests, so posthog is never even imported.
  it('reports no consent decision while disabled, so the banner stays hidden', () => {
    expect(service.consentDecision()).toEqual(null);
  });

  it('does nothing when disabled', async () => {
    await service.init();

    expect(() => {
      service.identify('a-user-id');
      service.capture('projection_created');
      service.optIn();
      service.optOut();
      service.reset();
    }).not.toThrow();
    expect(service.consentDecision()).toEqual(null);
  });
});
