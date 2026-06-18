import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { of, throwError } from 'rxjs';
import { YahooLeagueSyncComponent } from './yahoo-league-sync';
import { YahooService } from '../../../services/yahoo.service';
import { MappedLeagueSettings } from '../../../services/yahoo-league-mapping';
import { ConnectionResponse } from '../../../api/models/connection-response';
import { LeaguesResponse } from '../../../api/models/leagues-response';
import { LeagueSettingsResponse } from '../../../api/models/league-settings-response';

describe('YahooLeagueSyncComponent', () => {
  const connected: ConnectionResponse = { connected: true };
  const disconnected: ConnectionResponse = { connected: false };

  const oneLeague: LeaguesResponse = {
    leagues: [{ leagueKey: 'nhl.l.123', name: 'My League', numTeams: 12 }],
  };

  const pointsSettings: LeagueSettingsResponse = {
    leagueKey: 'nhl.l.123',
    name: 'My League',
    scoringType: 'headpoint',
    rosterPositions: [
      { count: 2, position: 'C' },
      { count: 4, position: 'D' },
      { count: 2, position: 'G' },
      { count: 4, position: 'BN' },
    ],
    statCategories: [
      { statId: 1, name: 'Goals', pointValue: 2 },
      { statId: 2, name: 'Assists', pointValue: 1 },
    ],
  };

  const categorySettings: LeagueSettingsResponse = {
    ...pointsSettings,
    scoringType: 'head',
    statCategories: [
      { statId: 1, name: 'Goals' },
      { statId: 2, name: 'Assists' },
    ],
  };

  const buildConnected = (settings: LeagueSettingsResponse = pointsSettings) =>
    MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(connected),
      myLeagues: () => of(oneLeague),
      leagueSettings: () => of(settings),
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
      leagueSettings: () => of(pointsSettings),
      startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
    });
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.connected()).toEqual(false);
    expect(component.leagues().length).toEqual(0);
  });

  it('emits mapped settings and a summary when syncing a points league', async () => {
    await buildConnected();
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const emitted: MappedLeagueSettings[] = [];
    component.synced.subscribe((mapped) => emitted.push(mapped));

    component.sync();
    await fixture.whenStable();

    expect(emitted.length).toEqual(1);
    expect(emitted[0].scoringType).toEqual('points');
    expect(component.summary()?.leagueName).toEqual('My League');
  });

  it('syncs a head-to-head categories league as a category projection', async () => {
    await buildConnected(categorySettings);
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const emitted: MappedLeagueSettings[] = [];
    component.synced.subscribe((mapped) => emitted.push(mapped));

    component.sync();
    await fixture.whenStable();

    expect(emitted.length).toEqual(1);
    expect(emitted[0].scoringType).toEqual('category');
    expect(component.summary()?.scoringType).toEqual('category');
  });

  it('surfaces an error when league settings fail to load', async () => {
    await MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(connected),
      myLeagues: () => of(oneLeague),
      leagueSettings: () => throwError(() => new Error('boom')),
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
