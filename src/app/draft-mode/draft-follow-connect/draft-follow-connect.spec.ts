import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, expect, it, vi } from 'vitest';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DraftFollowConnectComponent, FollowLeagueLink } from './draft-follow-connect';
import { YahooService } from '../../services/yahoo.service';
import { YahooConnectReturnService } from '../../services/yahoo-connect-return.service';
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

  const build = (yahoo: Partial<YahooService>) =>
    MockBuilder(DraftFollowConnectComponent)
      .mock(YahooService, {
        connectionStatus: () => of({ connected: true }),
        myLeagues: () => of(leagues),
        leagueProjectionSettings: () => of(settings),
        startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
        ...yahoo,
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
      leagueKey: '465.l.9',
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
      leagueKey: '465.l.9',
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
      leagueKey: '465.l.9',
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
      leagueKey: '465.l.9',
      leagueName: 'Beer League',
      settings: null,
    });
  });

  /** The connect leaves the app, so the way back must land on the board, not on projections. */
  it('remembers the board before leaving for Yahoo', async () => {
    const remember = vi.fn<(path: string) => void>();
    await MockBuilder(DraftFollowConnectComponent)
      .mock(YahooService, {
        connectionStatus: () => of({ connected: false }),
        // A failed start keeps the test from navigating the page to Yahoo.
        startConnect: () => throwError(() => new HttpErrorResponse({ status: 502 })),
      })
      .mock(YahooConnectReturnService, { remember })
      .mock(Router, { url: '/drafts/42' });
    const fixture = MockRender(DraftFollowConnectComponent, { current });
    await fixture.whenStable();

    fixture.point.componentInstance.connect();

    expect(remember).toHaveBeenCalledWith('/drafts/42');
    expect(fixture.point.componentInstance.error()).toBe("Couldn't start the Yahoo connection.");
  });
});
