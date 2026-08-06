import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { LeagueSyncComponent } from './league-sync';
import { YahooLeagueSyncComponent } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent } from '../espn-league-sync/espn-league-sync';
import { environment } from '../../../../environments/environment';

describe('LeagueSyncComponent', () => {
  const buildMocked = () =>
    MockBuilder(LeagueSyncComponent).mock(YahooLeagueSyncComponent).mock(EspnLeagueSyncComponent);

  it('renders only the Yahoo sync when ESPN is disabled', async () => {
    await buildMocked();
    const fixture = MockRender(LeagueSyncComponent);

    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();
    expect(fixture.nativeElement.querySelector('.provider-picker')).toBeNull();
  });

  it('shows the provider picker and switches to ESPN when enabled', async () => {
    environment.espnLeaguesEnabled = true;
    try {
      await buildMocked();
      const fixture = MockRender(LeagueSyncComponent);

      expect(fixture.nativeElement.querySelector('.provider-picker')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();

      fixture.point.componentInstance.provider.set('espn');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
    } finally {
      environment.espnLeaguesEnabled = false;
    }
  });
});
