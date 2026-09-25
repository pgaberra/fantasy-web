import { MockBuilder, MockRender } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { DraftModeComponent } from './draft-mode';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionCalculationService } from '../services/projection-calculation.service';
import { PositionFilterService } from '../services/position-filter.service';
import { FeatureService } from '../services/feature.service';
import { EspnService } from '../services/espn.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { Player } from '../models/player.model';
import { SkaterStats } from '../models/projection.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';
import { DraftState } from '../api/models/draft-state';
import { LeagueDraftResponse } from '../api/models/league-draft-response';
import { environment } from '../../environments/environment';

describe('DraftModeComponent following an ESPN draft', () => {
  const players: Player[] = [
    {
      id: 6743,
      type: 'skater',
      name: 'McDavid',
      positions: new Set(['C']),
      stats: {} as SkaterStats,
    },
    {
      id: 7109,
      type: 'skater',
      name: 'Makar',
      positions: new Set(['D']),
      stats: {} as SkaterStats,
    },
  ];

  const espnDraft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
    settings: {
      scoringType: 'points',
      statWeights: { goals: 1 },
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
      espnSync: { leagueName: 'Beer League', leagueId: '123', syncedAt: '2026-09-01T00:00:00Z' },
    },
  };

  const projectionWith = (draft: DraftState): ProjectionResponse => ({
    id: 'p1',
    kind: 'draft',
    name: 'My Projection',
    season: '20262027',
    autoNamed: false,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: {
      settings: {
        scoringType: 'points',
        statWeights: { goals: 1 },
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0 },
        useDefaultDecimals: false,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
      },
      players: [],
      draft,
    },
  });

  const leagueDraft = (picks: LeagueDraftResponse['picks'] = []): LeagueDraftResponse => ({
    status: 'IN_PROGRESS',
    auction: false,
    teams: [
      { id: 'espn.l.123.t.2', name: 'Bravo', mine: false },
      { id: 'espn.l.123.t.1', name: 'Alpha', mine: true },
    ],
    orderKnown: true,
    picks,
  });

  const updateProjection =
    vi.fn<(id: string, request: UpdateProjectionRequest) => Observable<ProjectionResponse>>();
  const espnLeagueDraft = vi.fn<(leagueId: string) => Observable<LeagueDraftResponse>>();
  const yahooLeagueDraft = vi.fn<(leagueKey: string) => Observable<LeagueDraftResponse>>();
  const renameProjection = vi.fn();
  const leagueDraftSync = signal(true);
  const espnLeagueDraftSync = signal(true);
  let loaded: ProjectionResponse;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateProjection.mockReset();
    renameProjection.mockReset();
    renameProjection.mockImplementation((id: string, name: string) => of({ id, name }));
    espnLeagueDraft.mockReset();
    yahooLeagueDraft.mockReset();
    leagueDraftSync.set(true);
    espnLeagueDraftSync.set(true);
    loaded = projectionWith(espnDraft);
    updateProjection.mockImplementation(() => of(loaded));
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(loaded),
        updateProjection,
        renameProjection,
      })
      .mock(FeatureService, { leagueDraftSync, espnLeagueDraftSync })
      .mock(EspnService, { leagueDraft: espnLeagueDraft })
      .mock(YahooService, { leagueDraft: yahooLeagueDraft })
      .mock(YahooConnectReturnService, { returnedTo: () => false })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'p1' : null) } },
        },
      });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderFixture = async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    return fixture;
  };

  const render = async () => (await renderFixture()).point.componentInstance;

  const text = (fixture: Awaited<ReturnType<typeof renderFixture>>, selector: string) => {
    fixture.detectChanges();
    return (
      (fixture.nativeElement as HTMLElement)
        .querySelector(selector)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    );
  };

  it("is offered on a board linked to an ESPN league only behind ESPN's own switch", async () => {
    const on = await render();
    expect(on.canFollow()).toBe(true);
    expect(on.canLinkLeague()).toBe(false);

    espnLeagueDraftSync.set(false);
    const off = await render();
    expect(off.canFollow()).toBe(false);
    // Yahoo's switch alone still offers linking a Yahoo league, as before.
    expect(off.canLinkLeague()).toBe(true);
  });

  it('follows the ESPN league: its teams, order and picks, named as ESPN', async () => {
    espnLeagueDraft.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: 'espn.l.123.t.2', playerId: 6743 }])),
    );
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.toggleFollow();

    expect(espnLeagueDraft).toHaveBeenCalledWith('123');
    expect(yahooLeagueDraft).not.toHaveBeenCalled();
    expect(component.following()).toBe(true);
    expect(component.order()).toEqual(['espn.l.123.t.2', 'espn.l.123.t.1']);
    expect(component.picks()).toEqual([{ playerId: 6743, teamId: 'espn.l.123.t.2' }]);
    expect(text(fixture, '.follow-status')).toContain('Live from Beer League on ESPN');
    expect(component.syncTip()).toContain('your ESPN draft');
  });

  it('keeps polling the ESPN league while following', async () => {
    espnLeagueDraft.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();

    espnLeagueDraft.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: 'espn.l.123.t.2', playerId: 7109 }])),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(espnLeagueDraft).toHaveBeenCalledTimes(2);
    expect(component.picks()).toEqual([{ playerId: 7109, teamId: 'espn.l.123.t.2' }]);
  });

  it("stops when ESPN refuses the league's draft, and says so", async () => {
    espnLeagueDraft.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();

    espnLeagueDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe("ESPN refused access to this league's draft.");
  });

  it('names ESPN when the team cannot be found', async () => {
    espnLeagueDraft.mockReturnValue(
      of({
        ...leagueDraft(),
        teams: leagueDraft().teams.map((team) => ({ ...team, mine: false })),
      }),
    );
    const component = await render();

    component.requestFollow();

    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe("Couldn't find your team in this ESPN league.");
  });

  describe('on a board with no league linked', () => {
    // The settings import's own switch, which this build keeps off outside a deployment.
    const espnLeaguesEnabled = environment.espnLeaguesEnabled;
    afterEach(() => {
      environment.espnLeaguesEnabled = espnLeaguesEnabled;
    });

    beforeEach(() => {
      environment.espnLeaguesEnabled = true;
      loaded = projectionWith({
        ...espnDraft,
        settings: { ...espnDraft.settings!, espnSync: undefined },
      });
    });

    it('offers to link a league on either platform whose drafts are followed here', async () => {
      const component = await render();
      expect(component.linkPlatforms()).toEqual(['Yahoo', 'ESPN']);
      expect(component.syncTip()).toContain('which Yahoo or ESPN league');

      leagueDraftSync.set(false);
      const espnOnly = await render();
      expect(espnOnly.canLinkLeague()).toBe(true);
      expect(espnOnly.linkPlatforms()).toEqual(['ESPN']);

      environment.espnLeaguesEnabled = false;
      expect((await render()).canLinkLeague()).toBe(false);
    });

    it("follows the ESPN league it is given, keeping the draft's own settings", async () => {
      espnLeagueDraft.mockReturnValue(of(leagueDraft()));
      const component = await render();
      component.toggleFollow();

      component.linkLeague({
        platform: 'ESPN',
        leagueId: '123',
        leagueName: 'Pond League',
        settings: null,
      });

      expect(component.linkOpen()).toBe(false);
      expect(component.following()).toBe(true);
      expect(espnLeagueDraft).toHaveBeenCalledWith('123');
      const saved = updateProjection.mock.calls[0][1].data.draft?.settings;
      expect(saved?.espnSync?.leagueId).toBe('123');
      expect(saved?.espnSync?.leagueName).toBe('Pond League');
      expect(saved?.activeScoringColumns).toEqual(['goals']);
    });
  });

  describe('when the cookies are what stopped it', () => {
    const noTeamOfMine = (): LeagueDraftResponse => ({
      ...leagueDraft(),
      teams: leagueDraft().teams.map((team) => ({ ...team, mine: false })),
    });

    it('asks for the cookies of the linked league when no team in it is yours', async () => {
      espnLeagueDraft.mockReturnValue(of(noTeamOfMine()));
      const component = await render();

      component.toggleFollow();

      expect(component.following()).toBe(false);
      expect(component.linkOpen()).toBe(true);
      expect(component.linkDialogPlatforms()).toEqual(['ESPN']);
      expect(component.cookieRepair()?.leagueId).toBe('123');
      expect(component.cookieRepair()?.reason).toContain("couldn't tell which team");
    });

    it('asks for them again when ESPN refuses the draft mid-sync', async () => {
      espnLeagueDraft.mockReturnValue(of(leagueDraft()));
      const component = await render();
      component.requestFollow();

      espnLeagueDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      await vi.advanceTimersByTimeAsync(5000);

      expect(component.following()).toBe(false);
      expect(component.cookieRepair()?.reason).toContain('no longer valid');
    });

    it('does not ask when the league is simply gone', async () => {
      espnLeagueDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      const component = await render();

      component.requestFollow();

      expect(component.cookieRepair()).toBeNull();
      expect(component.linkOpen()).toBe(false);
    });

    it('syncs again once the cookies are in, leaving the board and its name alone', async () => {
      espnLeagueDraft.mockReturnValue(of(noTeamOfMine()));
      const component = await render();
      component.requestFollow();
      updateProjection.mockClear();
      renameProjection.mockClear();

      espnLeagueDraft.mockReturnValue(of(leagueDraft()));
      component.linkLeague({
        platform: 'ESPN',
        leagueId: '123',
        leagueName: 'Beer League',
        settings: null,
      });

      expect(component.linkOpen()).toBe(false);
      expect(component.cookieRepair()).toBeNull();
      expect(component.following()).toBe(true);
      expect(renameProjection).not.toHaveBeenCalled();
      expect(updateProjection.mock.calls[0][1].data.draft?.settings?.espnSync?.leagueId).toBe(
        '123',
      );
    });

    it('lets the user close it and draft by hand', async () => {
      espnLeagueDraft.mockReturnValue(of(noTeamOfMine()));
      const component = await render();
      component.requestFollow();

      component.closeLink();

      expect(component.linkOpen()).toBe(false);
      expect(component.following()).toBe(false);
      expect(component.canUndo()).toBe(component.picks().length > 0);
    });
  });
});
