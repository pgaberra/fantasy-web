import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OffseasonDataNoticeComponent } from './offseason-data-notice';
import { environment } from '../../../environments/environment';

describe('OffseasonDataNoticeComponent', () => {
  const originalDisabled = environment.yahooSyncDisabled;

  beforeEach(() => MockBuilder(OffseasonDataNoticeComponent));

  afterEach(() => {
    environment.yahooSyncDisabled = originalDisabled;
  });

  it('shows the off-season data caveats when Yahoo sync is disabled', () => {
    environment.yahooSyncDisabled = true;
    const fixture = MockRender(OffseasonDataNoticeComponent);

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('.offseason-notice')).not.toBeNull();
    expect(text).toContain('off-season');
    expect(text.toLowerCase()).toContain('rookie');
    expect(text.toLowerCase()).toContain('team affiliations');
  });

  it('renders nothing while Yahoo sync is enabled', () => {
    environment.yahooSyncDisabled = false;
    const fixture = MockRender(OffseasonDataNoticeComponent);

    expect(fixture.nativeElement.querySelector('.offseason-notice')).toBeNull();
    expect((fixture.nativeElement.textContent as string).trim()).toEqual('');
  });
});
