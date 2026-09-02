import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OffseasonDataNoticeComponent } from './offseason-data-notice';
import { environment } from '../../../environments/environment';

describe('OffseasonDataNoticeComponent', () => {
  const originalEnabled = environment.offseasonEnabled;
  const originalSyncDisabled = environment.yahooSyncDisabled;

  beforeEach(() => MockBuilder(OffseasonDataNoticeComponent));

  afterEach(() => {
    environment.offseasonEnabled = originalEnabled;
    environment.yahooSyncDisabled = originalSyncDisabled;
  });

  it('shows the off-season data caveats when the off-season flag is on', () => {
    environment.offseasonEnabled = true;
    const fixture = MockRender(OffseasonDataNoticeComponent);

    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(fixture.nativeElement.querySelector('.offseason-notice')).not.toBeNull();
    expect(text).toContain('off-season');
    expect(text).toContain('rookie');
    expect(text).toContain('team affiliations');
    // The unavailable sync is hidden rather than explained — nothing to caveat.
    expect(text).not.toContain('yahoo sync');
  });

  it('renders nothing while the off-season flag is off', () => {
    environment.offseasonEnabled = false;
    const fixture = MockRender(OffseasonDataNoticeComponent);

    expect(fixture.nativeElement.querySelector('.offseason-notice')).toBeNull();
    expect((fixture.nativeElement.textContent as string).trim()).toEqual('');
  });

  // The notice used to piggyback on yahooSyncDisabled, which meant any pause of the Yahoo sync
  // announced an off-season that wasn't happening. The two flags are independent now.
  it('renders nothing while Yahoo sync is disabled but the off-season flag is off', () => {
    environment.offseasonEnabled = false;
    environment.yahooSyncDisabled = true;
    const fixture = MockRender(OffseasonDataNoticeComponent);

    expect(fixture.nativeElement.querySelector('.offseason-notice')).toBeNull();
  });
});
