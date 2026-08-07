import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { EspnLeagueSyncComponent, EspnSyncResult } from './espn-league-sync';
import { EspnService } from '../../../services/espn.service';
import { CredentialStatusResponse } from '../../../api/models/credential-status-response';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';

describe('EspnLeagueSyncComponent', () => {
  const settings: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: ['gp'],
    statWeights: { goals: 6, assists: 4 },
    rosterSlots: { c: 2, lw: 0, rw: 0, d: 4, util: 0, bn: 4, g: 2 },
    leagueSize: 12,
    unsupportedStats: ['Defensive Points'],
    unsupportedRosterCodes: ['IR'],
  };

  const noCredentials: CredentialStatusResponse = { hasCredentials: false };

  const buildDefault = () =>
    MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of(noCredentials),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => of(settings),
    });

  it('reflects stored credentials from the status probe on init', async () => {
    await MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of<CredentialStatusResponse>({ hasCredentials: true }),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => of(settings),
    });
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.hasStoredCredentials()).toEqual(true);
  });

  it('syncs a public league and emits the mapped settings', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const emitted: EspnSyncResult[] = [];
    component.synced.subscribe((result) => emitted.push(result));

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();

    expect(emitted).toEqual([{ settings, leagueId: '123456', season: component.season() }]);
    expect(component.unsupportedStats()).toEqual(['Defensive Points']);
    expect(component.syncedLeagueId()).toEqual('123456');
  });

  it('stores cookies for a private league before syncing', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.isPrivate.set(true);
    component.espnS2.set('s2-value');
    component.swid.set('{SWID-1}');
    component.sync();
    await fixture.whenStable();

    // hasStoredCredentials only flips true once the save-then-sync path has run.
    expect(component.hasStoredCredentials()).toEqual(true);
    expect(component.syncedLeagueId()).toEqual('123456');
  });

  it('requires a league id before syncing', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const emitted: EspnSyncResult[] = [];
    component.synced.subscribe((result) => emitted.push(result));

    component.sync();
    await fixture.whenStable();

    expect(component.error()).toBeTruthy();
    expect(emitted).toEqual([]);
  });

  it('explains a private-league (400) failure', async () => {
    await MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of(noCredentials),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 400 })),
    });
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();

    expect(component.error()).toContain('private');
  });
});
