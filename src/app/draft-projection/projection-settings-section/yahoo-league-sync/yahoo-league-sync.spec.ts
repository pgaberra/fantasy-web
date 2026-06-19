import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { of, throwError } from 'rxjs';
import { YahooLeagueSyncComponent } from './yahoo-league-sync';
import { YahooService } from '../../../services/yahoo.service';
import { ConnectionResponse } from '../../../api/models/connection-response';
import { LeaguesResponse } from '../../../api/models/leagues-response';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';

describe('YahooLeagueSyncComponent', () => {
  const connected: ConnectionResponse = { connected: true };
  const disconnected: ConnectionResponse = { connected: false };

  const oneLeague: LeaguesResponse = {
    leagues: [{ leagueKey: 'nhl.l.123', name: 'My League', numTeams: 12 }],
  };

  const settings: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: ['gp'],
    statWeights: { goals: 2, assists: 1 },
    rosterSlots: { c: 2, lw: 0, rw: 0, d: 4, util: 0, bn: 4, g: 2 },
    leagueSize: 12,
    unsupportedStats: ['Game-Tying Goals'],
    unsupportedRosterCodes: ['IR'],
  };

  const buildConnected = () =>
    MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(connected),
      myLeagues: () => of(oneLeague),
      leagueProjectionSettings: () => of(settings),
      startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
    });

  it('loads leagues and auto-selects the only one when connected', async () => {
    await buildConnected();
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.connected()).toEqual(true);
    expect(component.leagues().length).toEqual(1);
    expect(component.selectedKey()).toEqual('nhl.l.123');
  });

  it('shows the disconnected state when not connected', async () => {
    await MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(disconnected),
      myLeagues: () => of(oneLeague),
      leagueProjectionSettings: () => of(settings),
      startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
    });
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.connected()).toEqual(false);
    expect(component.leagues().length).toEqual(0);
  });

  it('emits the projection settings and builds a summary on sync', async () => {
    await buildConnected();
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const emitted: LeagueProjectionSettingsResponse[] = [];
    component.synced.subscribe((mapped) => emitted.push(mapped));

    component.sync();
    await fixture.whenStable();

    expect(emitted).toEqual([settings]);
    expect(component.summary()?.leagueName).toEqual('My League');
    expect(component.summary()?.scoringType).toEqual('points');
    expect(component.summary()?.unsupportedStats).toEqual(['Game-Tying Goals']);
  });

  it('surfaces an error when the settings fail to load', async () => {
    await MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(connected),
      myLeagues: () => of(oneLeague),
      leagueProjectionSettings: () => throwError(() => new Error('boom')),
      startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
    });
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.sync();
    await fixture.whenStable();

    expect(component.error()).toBeTruthy();
  });
});
