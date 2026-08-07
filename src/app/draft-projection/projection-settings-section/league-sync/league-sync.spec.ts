import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { LeagueSyncComponent } from './league-sync';
import { YahooLeagueSyncComponent } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent } from '../espn-league-sync/espn-league-sync';
import { YahooSync } from '../../../api/models/yahoo-sync';
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

  it('shows the picker with no platform pre-selected when enabled', async () => {
    environment.espnLeaguesEnabled = true;
    try {
      await buildMocked();
      const fixture = MockRender(LeagueSyncComponent);

      expect(fixture.nativeElement.querySelector('.provider-picker')).toBeTruthy();
      // Nothing pre-selected — no sync widget until the user picks a platform.
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();
    } finally {
      environment.espnLeaguesEnabled = false;
    }
  });

  it('reveals the chosen platform sync once a tab is picked', async () => {
    environment.espnLeaguesEnabled = true;
    try {
      await buildMocked();
      const fixture = MockRender(LeagueSyncComponent);
      const component = fixture.point.componentInstance;

      component.provider.set('yahoo');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();

      component.provider.set('espn');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
    } finally {
      environment.espnLeaguesEnabled = false;
    }
  });

  it('defaults to Yahoo when the projection was already synced from Yahoo', async () => {
    environment.espnLeaguesEnabled = true;
    try {
      await buildMocked();
      const lastSync: YahooSync = { leagueName: 'My League', leagueKey: 'nhl.l.1', syncedAt: 't' };
      const fixture = MockRender(LeagueSyncComponent, { lastSync });

      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
    } finally {
      environment.espnLeaguesEnabled = false;
    }
  });
});
