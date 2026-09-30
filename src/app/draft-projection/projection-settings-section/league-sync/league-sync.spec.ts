import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DisconnectCause, LeagueSyncComponent } from './league-sync';
import { PlatformSwitchDialogComponent } from './platform-switch-dialog/platform-switch-dialog';
import { YahooLeagueSyncComponent } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent } from '../espn-league-sync/espn-league-sync';
import { PlatformTabsComponent } from '../../../shared/platform-tabs/platform-tabs';
import { SyncedLineComponent } from '../../../shared/synced-line/synced-line';
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
      .keep(PlatformTabsComponent)
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
      .keep(PlatformTabsComponent)
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
      .keep(PlatformTabsComponent)
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
      .keep(PlatformTabsComponent)
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
      .keep(PlatformTabsComponent)
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
      .keep(PlatformTabsComponent)
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

  describe('switching platform while a league is synced', () => {
    const espnLinked = {
      lastEspnLeagueId: '12345',
      lastEspnSyncedAt: 't',
      lastEspnLeagueName: 'Tampa Bay Pro',
    };
    const renderSynced = async (inputs: Record<string, unknown>) => {
      environment.yahooSyncDisabled = false;
      environment.espnLeaguesEnabled = true;
      await MockBuilder(LeagueSyncComponent)
        .keep(PlatformTabsComponent)
        .keep(PlatformSwitchDialogComponent)
        .mock(YahooLeagueSyncComponent)
        .mock(EspnLeagueSyncComponent);
      const fixture = MockRender(LeagueSyncComponent, inputs);
      const causes: DisconnectCause[] = [];
      fixture.point.componentInstance.disconnected.subscribe((cause) => causes.push(cause));
      return { fixture, causes };
    };
    const tab = (fixture: { nativeElement: HTMLElement }, name: string) =>
      Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>('.provider-tab')).find(
        (button) => button.textContent?.includes(name),
      )!;
    const dialog = (fixture: { nativeElement: HTMLElement }) =>
      fixture.nativeElement.querySelector<HTMLElement>('app-platform-switch-dialog');
    const clickTab = (
      fixture: { nativeElement: HTMLElement; detectChanges(): void },
      name: string,
    ) => {
      tab(fixture, name).click();
      fixture.detectChanges();
    };

    it('asks before leaving the synced ESPN league for the Yahoo tab', async () => {
      const { fixture, causes } = await renderSynced(espnLinked);

      clickTab(fixture, 'Yahoo');

      const text = dialog(fixture)?.textContent;
      expect(text).toContain('Disconnect your ESPN league?');
      expect(text).toContain('Tampa Bay Pro');
      expect(text).toContain('Switching to Yahoo disconnects it.');
      // Asking changes nothing yet: the tab and the league are where they were.
      expect(tab(fixture, 'ESPN').getAttribute('aria-selected')).toEqual('true');
      expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeTruthy();
      expect(causes).toEqual([]);
    });

    it('asks the same the other way round, naming the Yahoo league', async () => {
      const lastSync: YahooSync = { leagueName: 'HHL', leagueKey: 'nhl.l.1', syncedAt: 't' };
      const { fixture } = await renderSynced({ lastSync });

      clickTab(fixture, 'ESPN');

      const text = dialog(fixture)?.textContent;
      expect(text).toContain('Disconnect your Yahoo league?');
      expect(text).toContain('HHL');
      expect(text).toContain('Switching to ESPN disconnects it.');
    });

    it('keeps the league and the tab when the question is declined', async () => {
      const { fixture, causes } = await renderSynced(espnLinked);
      clickTab(fixture, 'Yahoo');

      ngMocks.click(ngMocks.find('app-platform-switch-dialog .btn-secondary'));
      fixture.detectChanges();

      expect(dialog(fixture)).toBeNull();
      expect(tab(fixture, 'ESPN').getAttribute('aria-selected')).toEqual('true');
      expect(tab(fixture, 'Yahoo').getAttribute('aria-selected')).toEqual('false');
      expect(causes).toEqual([]);
    });

    it('disconnects the league and opens the other tab on confirmation', async () => {
      const { fixture, causes } = await renderSynced(espnLinked);
      clickTab(fixture, 'Yahoo');

      ngMocks.click(ngMocks.find('app-platform-switch-dialog .btn-primary'));
      fixture.detectChanges();

      expect(causes).toEqual(['platform-switch']);
      expect(dialog(fixture)).toBeNull();
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();

      // The host drops the link; the tab the user switched to stays open for the new sync.
      fixture.componentInstance['lastEspnSyncedAt'] = null;
      fixture.detectChanges();

      expect(fixture.point.componentInstance.provider()).toEqual('yahoo');
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
    });

    it('switches without asking when no league is synced', async () => {
      // A remembered id is where the next import starts, not a link.
      const { fixture, causes } = await renderSynced({ lastEspnLeagueId: '12345' });

      clickTab(fixture, 'ESPN');
      clickTab(fixture, 'Yahoo');

      expect(dialog(fixture)).toBeNull();
      expect(fixture.nativeElement.querySelector('app-yahoo-league-sync')).toBeTruthy();
      expect(causes).toEqual([]);
    });

    it("says nothing about the other platform's league on the tab itself", async () => {
      const { fixture } = await renderSynced(espnLinked);

      expect(fixture.nativeElement.textContent).not.toContain('replaces it');
    });
  });

  describe('disconnecting a league', () => {
    const yahooSync: YahooSync = { leagueName: 'HHL', leagueKey: '465.l.9', syncedAt: 'then' };
    const renderWith = async (params: Record<string, unknown>, yahooDisabled = false) => {
      environment.yahooSyncDisabled = yahooDisabled;
      environment.espnLeaguesEnabled = true;
      // The wrapper's own synced line is what some of these press, so it renders for real.
      await MockBuilder(LeagueSyncComponent)
        .keep(SyncedLineComponent)
        .mock(YahooLeagueSyncComponent)
        .mock(EspnLeagueSyncComponent);
      return MockRender(LeagueSyncComponent, params);
    };

    it('offers nothing to disconnect while no league is linked', async () => {
      const fixture = await renderWith({ lastEspnLeagueId: '123' });

      // A remembered ESPN id is where the next import starts, not a link.
      expect(fixture.point.componentInstance.linkedLeagueName()).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Disconnect');
    });

    it("hands the button to the linked platform's own synced line, and passes its press on", async () => {
      const fixture = await renderWith({ lastSync: yahooSync });
      const disconnected = vi.fn();
      fixture.point.componentInstance.disconnected.subscribe(disconnected);

      const yahoo = ngMocks.find(YahooLeagueSyncComponent);
      expect(ngMocks.input(yahoo, 'disconnectable')).toBe(true);
      // Stated once, where the link is named: no second line of its own.
      expect(fixture.nativeElement.querySelector('app-synced-line')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('locked to');
      ngMocks.output(yahoo, 'disconnected').emit();

      expect(disconnected).toHaveBeenCalledWith('button');
    });

    it('hands it to the ESPN panel for a linked ESPN league', async () => {
      const fixture = await renderWith({
        lastEspnLeagueId: '123',
        lastEspnSyncedAt: 'then',
        lastEspnLeagueName: 'Tampa Bay Pro',
      });

      expect(ngMocks.input(ngMocks.find(EspnLeagueSyncComponent), 'disconnectable')).toBe(true);
      expect(fixture.nativeElement.querySelector('app-synced-line')).toBeNull();
    });

    it("still offers it while the league's platform cannot be synced", async () => {
      const fixture = await renderWith({ lastSync: yahooSync }, true);
      const disconnected = vi.fn();
      fixture.point.componentInstance.disconnected.subscribe(disconnected);

      // Only ESPN is on offer, so no panel names the Yahoo link: a line of its own does.
      const line = fixture.nativeElement.querySelector('app-synced-line') as HTMLElement;
      expect(line.textContent).toContain('Synced with HHL');
      expect(ngMocks.input(ngMocks.find(EspnLeagueSyncComponent), 'disconnectable')).toBe(false);
      (line.querySelector('button') as HTMLButtonElement).click();

      expect(disconnected).toHaveBeenCalledWith('button');
    });

    it('still offers it with no platform to sync from at all', async () => {
      environment.yahooSyncDisabled = true;
      environment.espnLeaguesEnabled = false;
      await MockBuilder(LeagueSyncComponent).keep(SyncedLineComponent);
      const fixture = MockRender(LeagueSyncComponent, { lastSync: yahooSync });
      const disconnected = vi.fn();
      fixture.point.componentInstance.disconnected.subscribe(disconnected);

      const line = fixture.nativeElement.querySelector('app-synced-line') as HTMLElement;
      expect(line.textContent).toContain('Synced with HHL');
      (line.querySelector('button') as HTMLButtonElement).click();

      expect(disconnected).toHaveBeenCalled();
    });

    it('names a linked ESPN league by its stamp', async () => {
      const fixture = await renderWith({
        lastEspnLeagueId: '123',
        lastEspnSyncedAt: 'then',
        lastEspnLeagueName: 'Puck Luck Dynasty',
      });

      expect(fixture.point.componentInstance.linkedLeagueName()).toEqual('Puck Luck Dynasty');
    });
  });
});
