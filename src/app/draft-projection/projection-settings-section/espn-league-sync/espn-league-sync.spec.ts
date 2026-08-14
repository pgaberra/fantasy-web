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

    expect(emitted).toEqual([{ settings, leagueId: '123456' }]);
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

  it('starts from the league it synced last time instead of an empty field', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, { lastLeagueId: '123456' });
    await fixture.whenStable();

    expect(fixture.point.componentInstance.leagueId()).toEqual('123456');
    const input = fixture.nativeElement.querySelector('.espn-input') as HTMLInputElement;
    expect(input.value).toEqual('123456');
  });

  it('says when the league was last synced', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, {
      lastLeagueId: '123456',
      lastSyncedAt: '2026-08-14T17:12:00.000Z',
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Last synced 14 Aug 2026');
  });

  it('says nothing about a previous sync when there has not been one', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('Last synced');
  });

  it('opens the private section for a user whose cookies are already on file', async () => {
    await MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of<CredentialStatusResponse>({ hasCredentials: true }),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => of(settings),
    });
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    // Cookies on file mean last time's league was private — so the form opens the way it was left.
    expect(fixture.point.componentInstance.isPrivate()).toEqual(true);
    expect(fixture.nativeElement.querySelector('.espn-cookies')).toBeTruthy();
    // The values themselves are server-side and never handed back, so the inputs stay empty and
    // the panel offers to reuse what is stored.
    expect(fixture.nativeElement.textContent).toContain('leave these blank to reuse them');
  });

  it('leaves the private section closed for a user with nothing on file', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.isPrivate()).toEqual(false);
    expect(fixture.nativeElement.querySelector('.espn-cookies')).toBeNull();
  });

  it('opens the cookie fields itself when ESPN refuses a league it got no cookies for', async () => {
    await MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of(noCredentials),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 400 })),
    });
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.isPrivate()).toEqual(false);

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();

    expect(component.error()).toContain('private');
    // The message asks for the cookies, so the inputs it means have to be on screen.
    expect(component.isPrivate()).toEqual(true);
    expect(fixture.nativeElement.querySelector('.espn-cookies')).toBeTruthy();
  });

  it('blames the cookies, not the league, once cookies were actually sent', async () => {
    await MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of(noCredentials),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 400 })),
    });
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.isPrivate.set(true);
    component.espnS2.set('s2-value');
    component.swid.set('{SWID-1}');
    component.sync();
    await fixture.whenStable();

    expect(component.error()).toContain('cookies');
    expect(component.error()).not.toContain('This league is private');
  });

  it('stops offering to reuse stored cookies once ESPN has refused them', async () => {
    await MockBuilder(EspnLeagueSyncComponent).mock(EspnService, {
      credentialStatus: () => of<CredentialStatusResponse>({ hasCredentials: true }),
      saveCredentials: () => of(undefined),
      leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 400 })),
    });
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();

    // The fix is still in the cookie fields — the stored pair has to be replaceable.
    expect(component.isPrivate()).toEqual(true);
    expect(component.error()).toContain('cookies');
    // ...and telling the user to leave them blank to reuse what was just refused would be advice
    // straight back into the same failure.
    expect(component.storedCredentialsRefused()).toEqual(true);
    expect(fixture.nativeElement.textContent).not.toContain('leave these blank');
  });
});
