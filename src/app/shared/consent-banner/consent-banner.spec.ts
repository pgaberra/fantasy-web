import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentBannerComponent } from './consent-banner';
import { AnalyticsService, ConsentDecision } from '../../services/analytics.service';

const consentDecision = signal<ConsentDecision | null>('pending');
const optIn = vi.fn();
const optOut = vi.fn();

function setup() {
  return MockBuilder(ConsentBannerComponent).provide({
    provide: AnalyticsService,
    useValue: { consentDecision, optIn, optOut },
  });
}

describe('ConsentBannerComponent', () => {
  beforeEach(() => {
    consentDecision.set('pending');
    optIn.mockClear();
    optOut.mockClear();
  });

  it('shows the banner while the decision is pending', async () => {
    await setup();
    MockRender(ConsentBannerComponent);
    expect(ngMocks.findAll('.consent-banner').length).toEqual(1);
  });

  it('renders nothing once consent is granted', async () => {
    consentDecision.set('granted');
    await setup();
    MockRender(ConsentBannerComponent);
    expect(ngMocks.findAll('.consent-banner').length).toEqual(0);
  });

  it('renders nothing once consent is denied', async () => {
    consentDecision.set('denied');
    await setup();
    MockRender(ConsentBannerComponent);
    expect(ngMocks.findAll('.consent-banner').length).toEqual(0);
  });

  // Null means analytics is disabled or still loading — a cookie banner for a system that
  // isn't running would be worse than no banner.
  it('renders nothing when analytics is disabled', async () => {
    consentDecision.set(null);
    await setup();
    MockRender(ConsentBannerComponent);
    expect(ngMocks.findAll('.consent-banner').length).toEqual(0);
  });

  it('opts in when Accept is clicked', async () => {
    await setup();
    const fixture = MockRender(ConsentBannerComponent);

    fixture.point.componentInstance.accept();

    expect(optIn).toHaveBeenCalledTimes(1);
    expect(optOut).not.toHaveBeenCalled();
  });

  it('opts out when Decline is clicked', async () => {
    await setup();
    const fixture = MockRender(ConsentBannerComponent);

    fixture.point.componentInstance.decline();

    expect(optOut).toHaveBeenCalledTimes(1);
    expect(optIn).not.toHaveBeenCalled();
  });
});
