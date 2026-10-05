import { DatePipe } from '@angular/common';
import { MockBuilder, MockRender } from 'ng-mocks';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { EspnLeagueSyncComponent, EspnSyncResult } from './espn-league-sync';
import { EspnService } from '../../../services/espn.service';
import { CookieFieldDirective } from '../../../shared/cookie-field/cookie-field';
import { SyncedLineComponent } from '../../../shared/synced-line/synced-line';
import { CredentialStatusResponse } from '../../../api/models/credential-status-response';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';

describe('EspnLeagueSyncComponent', () => {
  beforeEach(() => localStorage.clear());

  const settings: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: ['gp'],
    statWeights: { goals: 6, assists: 4 },
    rosterSlots: { c: 2, lw: 0, rw: 0, w: 0, f: 0, d: 4, util: 0, bn: 4, g: 2 },
    leagueSize: 12,
    unsupportedStats: ['Defensive Points'],
    unsupportedRosterCodes: ['IR'],
  };

  const noCredentials: CredentialStatusResponse = { hasCredentials: false };

  const buildDefault = () =>
    MockBuilder(EspnLeagueSyncComponent)
      .mock(EspnService, {
        credentialStatus: () => of(noCredentials),
        saveCredentials: () => of(undefined),
        leagueProjectionSettings: () => of(settings),
      })
      // Left real, with its DatePipe: a mocked pipe renders nothing, which is exactly what the
      // synced line is asserting about.
      .keep(SyncedLineComponent)
      .keep(DatePipe);

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

  it('makes syncing the primary action once a league id is entered, not before', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const button = () => fixture.nativeElement.querySelector('.espn-sync-row button');

    expect(button().classList).toContain('btn-secondary');
    expect(button().classList).not.toContain('btn-primary');

    fixture.point.componentInstance.leagueId.set('123456');
    fixture.detectChanges();
    expect(button().classList).toContain('btn-primary');
    expect(button().classList).not.toContain('btn-secondary');
  });

  it('keeps a re-sync of the league already synced secondary', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, { lastLeagueId: '123456' });
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const button = () => fixture.nativeElement.querySelector('.espn-sync-row button');

    expect(component.syncPending()).toBe(false);
    expect(button().classList).toContain('btn-secondary');

    component.leagueId.set('654321');
    fixture.detectChanges();
    expect(button().classList).toContain('btn-primary');

    component.sync();
    await fixture.whenStable();
    expect(component.syncPending()).toBe(false);
    expect(button().classList).toContain('btn-secondary');
  });

  it('offers a re-sync to a user coming back to a league synced before', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, {
      lastLeagueId: '123456',
      lastSyncedAt: '2026-08-14T17:12:00.000Z',
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.espn-sync-row button').textContent.trim()).toEqual(
      'Re-sync settings',
    );
  });

  it('offers a sync again, not a re-sync, for a league disconnected since', async () => {
    await buildDefault();
    // The id outlives a disconnect, so the form starts from it; the stamp is what went.
    const fixture = MockRender(EspnLeagueSyncComponent, { lastLeagueId: '123456' });
    await fixture.whenStable();

    expect(fixture.point.componentInstance.leagueId()).toEqual('123456');
    expect(fixture.nativeElement.querySelector('.espn-sync-row button').textContent.trim()).toEqual(
      'Sync settings',
    );
  });

  it('offers a first sync when nothing has been synced', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.espn-sync-row button').textContent.trim()).toEqual(
      'Sync settings',
    );
  });

  it('says when the league was last synced', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, {
      lastLeagueId: '123456',
      lastSyncedAt: '2026-08-14T17:12:00.000Z',
      lastLeagueName: 'My 2027 League',
    });
    await fixture.whenStable();

    const status = fixture.nativeElement.querySelector('app-synced-line');
    expect(status.textContent).toContain('Synced with');
    expect(status.textContent).toContain('My 2027 League');
    expect(status.textContent).toContain('Aug 14, 2026');
    // Same green dot as the toolbar button that opened this dialog.
    expect(status.querySelector('.sync-dot')).toBeTruthy();
  });

  it('states the sync without a name when ESPN gave the league none', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, {
      lastLeagueId: '123456',
      lastSyncedAt: '2026-08-14T17:12:00.000Z',
    });
    await fixture.whenStable();

    const status = fixture.nativeElement.querySelector('app-synced-line');
    expect(status.textContent).toContain('Synced');
    expect(status.textContent).toContain('Aug 14, 2026');
  });

  it('names a fresh sync once, on the status line the page stamps', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, {
      lastLeagueId: null as string | null,
      lastSyncedAt: null as string | null,
    });
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.sync();
    // What every host does with the emitted result: stamp the league and the time.
    fixture.componentInstance.lastLeagueId = '123456';
    fixture.componentInstance.lastSyncedAt = '2026-09-30T00:33:00.000Z';
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text.match(/Synced/g)?.length).toEqual(1);
    expect(text).toContain('Re-sync settings');
  });

  it('offers Disconnect on the status line only when the host says the link is its own', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, {
      lastLeagueId: '123456',
      lastSyncedAt: '2026-08-14T17:12:00.000Z',
      lastLeagueName: 'Tampa Bay Pro',
      disconnectable: false,
    });
    await fixture.whenStable();
    const status = () => fixture.nativeElement.querySelector('app-synced-line') as HTMLElement;
    expect(status().querySelector('button')).toBeNull();

    fixture.componentInstance.disconnectable = true;
    fixture.detectChanges();
    const disconnected = vi.fn();
    fixture.point.componentInstance.disconnected.subscribe(disconnected);
    const button = status().querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toEqual('Disconnect');
    button.click();

    expect(disconnected).toHaveBeenCalled();
  });

  it('says nothing about a previous sync when there has not been one', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('app-synced-line')).toBeNull();
  });

  it('leaves the private box unticked for a user whose cookies are on file', async () => {
    await MockBuilder(EspnLeagueSyncComponent)
      .mock(EspnService, {
        credentialStatus: () => of<CredentialStatusResponse>({ hasCredentials: true }),
        saveCredentials: () => of(undefined),
        leagueProjectionSettings: () => of(settings),
      })
      .keep(DatePipe);
    const fixture = MockRender(EspnLeagueSyncComponent, { lastLeagueId: '123456' });
    await fixture.whenStable();

    // The cookies belong to the account, not to this league, which may well be public.
    expect(fixture.point.componentInstance.isPrivate()).toEqual(false);
    expect(fixture.nativeElement.querySelector('.espn-cookies')).toBeNull();
  });

  it('opens the private section with empty fields for a user whose cookies are on file', async () => {
    await MockBuilder(EspnLeagueSyncComponent)
      .mock(EspnService, {
        credentialStatus: () => of<CredentialStatusResponse>({ hasCredentials: true }),
        saveCredentials: () => of(undefined),
        leagueProjectionSettings: () => of(settings),
      })
      .keep(DatePipe);
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.togglePrivate();
    fixture.detectChanges();

    // The stored cookies are never read back into the page; the note says they are in use.
    expect(component.espnS2()).toEqual('');
    expect(component.swid()).toEqual('');
    expect(fixture.nativeElement.querySelector('.espn-stored-hint')?.textContent).toContain(
      'Your ESPN cookies are saved.',
    );
  });

  it('keeps the stored pair when the fields are empty and replaces it with a pasted pair', async () => {
    const saveCredentials = vi.fn(() => of(undefined));
    await MockBuilder(EspnLeagueSyncComponent)
      .mock(EspnService, {
        credentialStatus: () => of<CredentialStatusResponse>({ hasCredentials: true }),
        saveCredentials,
        leagueProjectionSettings: () => of(settings),
      })
      .keep(DatePipe);
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();
    expect(saveCredentials).not.toHaveBeenCalled();

    component.togglePrivate();
    component.espnS2.set('fresh-s2');
    component.swid.set('{FRESH}');
    component.sync();
    await fixture.whenStable();
    expect(saveCredentials).toHaveBeenCalledWith({ espnS2: 'fresh-s2', swid: '{FRESH}' });
  });

  it('shows no saved note to a user with nothing on file', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.isPrivate.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.espn-cookies')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.espn-stored-hint')).toBeNull();
  });

  it('gives the password manager no login form: the cookie fields are masked text fields', async () => {
    // A password input here made Chrome fill the saved SlapStat sign-in into League ID and espn_s2.
    await buildDefault().keep(CookieFieldDirective);
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.isPrivate.set(true);
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('input[type="password"]').length).toEqual(0);
    const cookieFields = Array.from(page.querySelectorAll<HTMLInputElement>('.espn-cookies input'));
    expect(cookieFields.map((field) => field.getAttribute('aria-label'))).toEqual([
      'espn_s2 cookie',
      'SWID cookie',
    ]);
    for (const field of cookieFields) {
      expect(field.type).toEqual('text');
      expect(field.getAttribute('autocomplete')).toEqual('off');
      expect(field.hasAttribute('data-1p-ignore')).toEqual(true);
      expect(field.getAttribute('style')).toContain('-webkit-text-security: disc');
    }
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

  it('keeps the cookie fields on screen when ESPN refuses the stored pair', async () => {
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

    // The fix is in the cookie fields — the stored pair has to be replaceable.
    expect(component.isPrivate()).toEqual(true);
    expect(fixture.nativeElement.querySelector('.espn-cookies')).toBeTruthy();
    expect(component.error()).toContain('cookies');
  });

  /** Team Power Rankings asks for its league with this card; only the words change. */
  it('names the card and its button for the rankings when asked for them', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, { purpose: 'rankings' });
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Rank your ESPN league');
    expect(text).toContain('Show rankings');
    expect(text).not.toContain('Sync settings');
    expect(text).toContain('Not counted');
  });

  /** The Streamer Planner asks for its league with this card too. */
  it('names the card and its button for the planner when asked for it', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, { purpose: 'planner' });
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Plan from your ESPN league');
    expect(text).toContain('Show free agents');
    expect(text).not.toContain('Sync settings');
  });

  it('starts on the ESPN league last chosen anywhere, where none was synced here', async () => {
    localStorage.setItem(
      'slapstat.league',
      JSON.stringify({ platform: 'ESPN', leagueId: '777', name: 'Office League' }),
    );
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.leagueId()).toBe('777');
  });

  it('keeps the league synced here over the one last chosen elsewhere', async () => {
    localStorage.setItem(
      'slapstat.league',
      JSON.stringify({ platform: 'ESPN', leagueId: '777', name: 'Office League' }),
    );
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent, { lastLeagueId: '555' });
    await fixture.whenStable();

    expect(fixture.point.componentInstance.leagueId()).toBe('555');
  });

  it('remembers the league ESPN accepts, for the next page that picks one', async () => {
    await buildDefault();
    const fixture = MockRender(EspnLeagueSyncComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.leagueId.set('123456');
    component.sync();
    await fixture.whenStable();

    expect(JSON.parse(localStorage.getItem('slapstat.league') ?? 'null')).toEqual({
      platform: 'ESPN',
      leagueId: '123456',
      name: 'ESPN league 123456',
    });
  });
});
