import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, expect, it, vi } from 'vitest';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DraftFollowConnectComponent, FollowLeagueLink } from './draft-follow-connect';
import { YahooService } from '../../services/yahoo.service';
import { EspnService } from '../../services/espn.service';
import { YahooConnectReturnService } from '../../services/yahoo-connect-return.service';
import { YahooLeaguePicker } from '../../shared/yahoo-league-picker';
import { DraftSettings } from '../../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';

describe('DraftFollowConnectComponent', () => {
  const slots = { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 };

  const current: DraftSettings = {
    scoringType: 'points',
    statWeights: { goals: 3 },
    activeScoringColumns: ['goals'],
    activeUtilityColumns: ['gp'],
    rosterSlots: slots,
  };

  const settings: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    statWeights: { goals: 3 },
    activeScoringColumns: ['goals'],
    activeUtilityColumns: ['gp'],
    rosterSlots: slots,
    unsupportedRosterCodes: [],
    unsupportedStats: [],
  };

  const leagues = {
    leagues: [{ leagueKey: '465.l.9', name: 'Beer League', numTeams: 12 }],
  };

  const build = (yahoo: Partial<YahooService>, espn: Partial<EspnService> = {}) =>
    MockBuilder(DraftFollowConnectComponent)
      .keep(YahooLeaguePicker)
      .mock(YahooService, {
        connectionStatus: () => of({ connected: true }),
        myLeagues: () => of(leagues),
        leagueProjectionSettings: () => of(settings),
        startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
        ...yahoo,
      })
      .mock(EspnService, {
        credentialStatus: () => of({ hasCredentials: false }),
        leagueProjectionSettings: () => of({ ...settings, leagueName: 'Pond League' }),
        saveCredentials: () => of(undefined),
        ...espn,
      })
      .mock(YahooConnectReturnService);

  const render = async (yahoo: Partial<YahooService> = {}) => {
    await build(yahoo);
    const fixture = MockRender(DraftFollowConnectComponent, { current });
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  const linkFrom = (component: DraftFollowConnectComponent) => {
    const linked = vi.fn<(link: FollowLeagueLink) => void>();
    component.linked.subscribe(linked);
    return linked;
  };

  it('loads the leagues of a connected account and takes the only one on offer', async () => {
    const component = await render();

    expect(component.connected()).toBe(true);
    expect(component.selectedKey()).toBe('465.l.9');
  });

  it('links without a question where the league scores the draft as it stands', async () => {
    const component = await render();
    const linked = linkFrom(component);

    component.choose();

    expect(component.differences()).toEqual([]);
    expect(linked).toHaveBeenCalledWith({
      platform: 'Yahoo',
      leagueId: '465.l.9',
      leagueName: 'Beer League',
      settings,
    });
  });

  it('asks about the settings only where they differ, and keeps the draft’s if told to', async () => {
    const component = await render({
      leagueProjectionSettings: () => of({ ...settings, activeScoringColumns: ['goals', 'hits'] }),
    });
    const linked = linkFrom(component);

    component.choose();

    expect(component.differences()).toEqual(['Scoring categories']);
    expect(linked).not.toHaveBeenCalled();

    component.keepMySettings();

    expect(linked).toHaveBeenCalledWith({
      platform: 'Yahoo',
      leagueId: '465.l.9',
      leagueName: 'Beer League',
      settings: null,
    });
  });

  it("hands the league's settings over when those are the ones wanted", async () => {
    const theirs = { ...settings, activeScoringColumns: ['goals', 'hits'] };
    const component = await render({ leagueProjectionSettings: () => of(theirs) });
    const linked = linkFrom(component);

    component.choose();
    component.useLeagueSettings();

    expect(linked).toHaveBeenCalledWith({
      platform: 'Yahoo',
      leagueId: '465.l.9',
      leagueName: 'Beer League',
      settings: theirs,
    });
  });

  // The picks are what following needs; settings that can't be read only cost the import.
  it('says so when the settings cannot be read, and still offers the picks', async () => {
    const component = await render({
      leagueProjectionSettings: () =>
        throwError(
          () => new HttpErrorResponse({ status: 424, error: { code: 'YAHOO_ACCESS_DENIED' } }),
        ),
    });
    const linked = linkFrom(component);

    component.choose();

    expect(component.settingsFailed()).toBe(true);
    expect(component.error()).toContain('Yahoo refused access');
    expect(linked).not.toHaveBeenCalled();

    component.keepMySettings();

    expect(linked).toHaveBeenCalledWith({
      platform: 'Yahoo',
      leagueId: '465.l.9',
      leagueName: 'Beer League',
      settings: null,
    });
  });

  /** The connect leaves the app, so the way back must land on the board, not on projections. */
  it('remembers the board before leaving for Yahoo', async () => {
    const remember = vi.fn<(path: string) => void>();
    await MockBuilder(DraftFollowConnectComponent)
      .keep(YahooLeaguePicker)
      .mock(YahooService, {
        connectionStatus: () => of({ connected: false }),
        // A failed start keeps the test from navigating the page to Yahoo.
        startConnect: () => throwError(() => new HttpErrorResponse({ status: 502 })),
      })
      .mock(EspnService)
      .mock(YahooConnectReturnService, { remember })
      .mock(Router, { url: '/drafts/42' });
    const fixture = MockRender(DraftFollowConnectComponent, { current });
    await fixture.whenStable();

    fixture.point.componentInstance.connect();

    expect(remember).toHaveBeenCalledWith('/drafts/42');
    expect(fixture.point.componentInstance.error()).toBe("Couldn't start the Yahoo connection.");
  });

  describe('on ESPN', () => {
    const renderEspn = async (
      espn: Partial<EspnService> = {},
      yahoo: Partial<YahooService> = {},
      draft: DraftSettings = current,
    ) => {
      await build(yahoo, espn);
      const fixture = MockRender(DraftFollowConnectComponent, {
        current: draft,
        platforms: ['Yahoo', 'ESPN'],
      });
      await fixture.whenStable();
      return fixture;
    };

    it('opens on ESPN where the draft last imported an ESPN league, with its id filled in', async () => {
      const connectionStatus = vi.fn(() => of({ connected: true }));
      const fixture = await renderEspn(
        {},
        { connectionStatus },
        {
          ...current,
          lastEspnLeagueId: '777',
        },
      );
      const component = fixture.point.componentInstance;

      expect(component.platform()).toBe('ESPN');
      expect(component.espnLeagueId()).toBe('777');
      // Yahoo is not asked about until its tab is opened.
      expect(connectionStatus).not.toHaveBeenCalled();

      component.choosePlatform('Yahoo');
      expect(connectionStatus).toHaveBeenCalled();
    });

    it('links the ESPN league by the id typed, named as ESPN names it', async () => {
      const fixture = await renderEspn();
      const component = fixture.point.componentInstance;
      const linked = linkFrom(component);

      component.choosePlatform('ESPN');
      component.onEspnLeagueIdInput({ target: { value: ' 123 ' } } as unknown as Event);
      component.choose();

      expect(linked).toHaveBeenCalledWith({
        platform: 'ESPN',
        leagueId: '123',
        leagueName: 'Pond League',
        settings: { ...settings, leagueName: 'Pond League' },
      });
    });

    it('saves pasted cookies before reading a private league', async () => {
      const saveCredentials = vi.fn(() => of(undefined));
      const leagueProjectionSettings = vi.fn(() => of(settings));
      const fixture = await renderEspn({ saveCredentials, leagueProjectionSettings });
      const component = fixture.point.componentInstance;

      component.choosePlatform('ESPN');
      component.onEspnLeagueIdInput({ target: { value: '123' } } as unknown as Event);
      component.toggleEspnPrivate();
      component.onEspnS2Input({ target: { value: 's2' } } as unknown as Event);
      component.onSwidInput({ target: { value: '{swid}' } } as unknown as Event);
      component.choose();

      expect(saveCredentials).toHaveBeenCalledWith({ espnS2: 's2', swid: '{swid}' });
      expect(leagueProjectionSettings).toHaveBeenCalledWith('123');
    });

    it('asks for cookies when ESPN refuses the league, and offers nothing to follow', async () => {
      const fixture = await renderEspn({
        leagueProjectionSettings: () => throwError(() => new HttpErrorResponse({ status: 400 })),
      });
      const component = fixture.point.componentInstance;
      const linked = linkFrom(component);

      component.choosePlatform('ESPN');
      component.onEspnLeagueIdInput({ target: { value: '123' } } as unknown as Event);
      component.choose();

      expect(component.espnPrivate()).toBe(true);
      expect(component.settingsFailed()).toBe(false);
      expect(component.error()).toBe(
        'This league is private. Add your espn_s2 and SWID cookies, then try again.',
      );
      expect(linked).not.toHaveBeenCalled();
    });

    it('shows the tabs only where both platforms are offered', async () => {
      const fixture = await renderEspn();
      fixture.detectChanges();
      const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('.provider-tab');

      expect([...tabs].map((tab) => tab.textContent?.trim())).toEqual(['Yahoo', 'ESPN']);
    });
  });
});
