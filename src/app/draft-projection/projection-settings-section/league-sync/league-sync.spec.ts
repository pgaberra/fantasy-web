import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, afterEach } from 'vitest';
import { LeagueSyncComponent } from './league-sync';
import { YahooLeagueSyncComponent } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent } from '../espn-league-sync/espn-league-sync';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { environment } from '../../../../environments/environment';

describe('LeagueSyncComponent', () => {
  const originalYahooDisabled = environment.yahooSyncDisabled;
  const originalEspnEnabled = environment.espnLeaguesEnabled;

  afterEach(() => {
    environment.yahooSyncDisabled = originalYahooDisabled;
    environment.espnLeaguesEnabled = originalEspnEnabled;
  });

  const render = async (yahooDisabled: boolean, espnEnabled: boolean) => {
    environment.yahooSyncDisabled = yahooDisabled;
    environment.espnLeaguesEnabled = espnEnabled;
    await MockBuilder(LeagueSyncComponent)
      .mock(YahooLeagueSyncComponent)
      .mock(EspnLeagueSyncComponent);
    return MockRender(LeagueSyncComponent);
  };

  it('offers both platforms with none pre-selected when both are available', async () => {
    const fixture = await render(false, true);

    expect(fixture.nativeElement.querySelectorAll('.provider-tab').length).toEqual(2);
    expect(fixture.nativeElement.textContent).toContain('Choose Yahoo or ESPN');
    // Nothing pre-selected — no sync widget until the user picks a platform.
    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();
  });

  it('reveals the chosen platform sync once a tab is picked', async () => {
    const fixture = await render(false, true);
    const component = fixture.point.componentInstance;

    component.provider.set('espn');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
  });

  it('hides the ESPN tab and pre-selects Yahoo as the only platform on offer', async () => {
    const fixture = await render(false, false);

    const tabs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.provider-tab'));
    expect(tabs.length).toEqual(1);
    expect(tabs[0].textContent?.trim()).toContain('Yahoo');
    expect(tabs[0].getAttribute('aria-selected')).toEqual('true');
    expect(fixture.nativeElement.textContent).toContain('On Yahoo?');
    expect(fixture.nativeElement.textContent).not.toContain('ESPN');
    // The one platform's sync is open already — there was no alternative to choose between.
    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
  });

  it('hides the Yahoo tab and pre-selects ESPN during the Yahoo off-season', async () => {
    const fixture = await render(true, true);

    const tabs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.provider-tab'));
    expect(tabs.length).toEqual(1);
    expect(tabs[0].textContent?.trim()).toContain('ESPN');
    expect(tabs[0].getAttribute('aria-selected')).toEqual('true');
    expect(fixture.nativeElement.textContent).toContain('On ESPN?');
    expect(fixture.nativeElement.textContent).not.toContain('Yahoo');
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
  });

  it('hides the whole section when neither platform can be synced', async () => {
    const fixture = await render(true, false);

    expect(fixture.nativeElement.querySelector('.league-sync-title')).toBeNull();
    expect(fixture.nativeElement.querySelector('.provider-picker')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();
  });

  it('does not default to Yahoo for an already-synced projection while Yahoo is off', async () => {
    environment.yahooSyncDisabled = true;
    environment.espnLeaguesEnabled = true;
    await MockBuilder(LeagueSyncComponent)
      .mock(YahooLeagueSyncComponent)
      .mock(EspnLeagueSyncComponent);
    const lastSync: YahooSync = { leagueName: 'My League', leagueKey: 'nhl.l.1', syncedAt: 't' };
    const fixture = MockRender(LeagueSyncComponent, { lastSync });

    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
    // ESPN is the only platform left, so it takes the pre-selection.
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
  });

  it('defaults to ESPN when the settings were already synced from ESPN', async () => {
    environment.yahooSyncDisabled = false;
    environment.espnLeaguesEnabled = true;
    await MockBuilder(LeagueSyncComponent)
      .mock(YahooLeagueSyncComponent)
      .mock(EspnLeagueSyncComponent);
    const fixture = MockRender(LeagueSyncComponent, {
      lastEspnLeagueId: '12345',
      lastEspnSyncedAt: 't',
    });

    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
  });

  it('leaves the picker open on a league id remembered from a sync that was since undone', async () => {
    environment.yahooSyncDisabled = false;
    environment.espnLeaguesEnabled = true;
    await MockBuilder(LeagueSyncComponent)
      .mock(YahooLeagueSyncComponent)
      .mock(EspnLeagueSyncComponent);
    // The id outlives an unsync; the stamp does not, and the stamp is what claims a platform.
    const fixture = MockRender(LeagueSyncComponent, { lastEspnLeagueId: '12345' });

    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeNull();
  });

  it('defaults to Yahoo when the projection was already synced from Yahoo', async () => {
    environment.yahooSyncDisabled = false;
    environment.espnLeaguesEnabled = true;
    await MockBuilder(LeagueSyncComponent)
      .mock(YahooLeagueSyncComponent)
      .mock(EspnLeagueSyncComponent);
    const lastSync: YahooSync = { leagueName: 'My League', leagueKey: 'nhl.l.1', syncedAt: 't' };
    const fixture = MockRender(LeagueSyncComponent, { lastSync });

    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
  });

  it('opens on Yahoo when it is back from a Yahoo connect, whatever it last synced from', async () => {
    environment.yahooSyncDisabled = false;
    environment.espnLeaguesEnabled = true;
    await MockBuilder(LeagueSyncComponent)
      .mock(YahooLeagueSyncComponent)
      .mock(EspnLeagueSyncComponent);
    const fixture = MockRender(LeagueSyncComponent, {
      openOnYahoo: true,
      lastEspnLeagueId: '12345',
      lastEspnSyncedAt: 't',
    });

    expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();
  });
});
