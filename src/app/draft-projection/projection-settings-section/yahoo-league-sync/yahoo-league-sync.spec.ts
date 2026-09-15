import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { YahooLeagueSyncComponent, YahooSyncResult } from './yahoo-league-sync';
import { YahooService } from '../../../services/yahoo.service';
import { ConnectionResponse } from '../../../api/models/connection-response';
import { LeaguesResponse } from '../../../api/models/leagues-response';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { environment } from '../../../../environments/environment';

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

  it('clears the selected league when the projection becomes unsynced', async () => {
    await buildConnected();
    const synced: YahooSync | null = {
      leagueName: 'My League',
      leagueKey: 'nhl.l.123',
      syncedAt: 't',
    };
    const fixture = MockRender(YahooLeagueSyncComponent, { lastSync: synced });
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.selectedKey()).toEqual('nhl.l.123');

    (fixture.componentInstance as { lastSync: YahooSync | null }).lastSync = null;
    fixture.detectChanges();
    expect(component.selectedKey()).toBeNull();
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

  it('emits the settings and league identity and tracks unsupported stats on sync', async () => {
    await buildConnected();
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const emitted: YahooSyncResult[] = [];
    component.synced.subscribe((result) => emitted.push(result));

    component.sync();
    await fixture.whenStable();

    expect(emitted).toEqual([{ settings, leagueName: 'My League', leagueKey: 'nhl.l.123' }]);
    expect(component.unsupportedStats()).toEqual(['Game-Tying Goals']);
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

  it('says Yahoo refused, not that loading failed, when Yahoo refuses the leagues', async () => {
    await MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(connected),
      myLeagues: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 424,
              error: { code: 'YAHOO_ACCESS_DENIED', message: 'Yahoo refused the request' },
            }),
        ),
      leagueProjectionSettings: () => of(settings),
      startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
    });
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.error()).toBe('Yahoo refused access to your leagues.');
  });

  it('keeps the loading message for a failure that is not a refusal', async () => {
    await MockBuilder(YahooLeagueSyncComponent).mock(YahooService, {
      connectionStatus: () => of(connected),
      myLeagues: () => throwError(() => new HttpErrorResponse({ status: 502 })),
      leagueProjectionSettings: () => of(settings),
      startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
    });
    const fixture = MockRender(YahooLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.error()).toBe('Could not load your Yahoo leagues.');
  });

  it('renders no sync controls when sync is disabled', async () => {
    environment.yahooSyncDisabled = true;
    try {
      await buildConnected();
      const fixture = MockRender(YahooLeagueSyncComponent);
      await fixture.whenStable();

      // The parent (app-league-sync) hides this component entirely when Yahoo sync is off; the
      // component's own guard keeps it inert if it is ever rendered anyway.
      expect(fixture.nativeElement.querySelector('button')).toBeNull();
      expect(fixture.nativeElement.querySelector('select')).toBeNull();
    } finally {
      environment.yahooSyncDisabled = false;
    }
  });
});
