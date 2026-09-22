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
import { YahooService } from '../services/yahoo.service';
import { Player } from '../models/player.model';
import { SkaterStats } from '../models/projection.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';
import { DraftState } from '../api/models/draft-state';
import { LeagueDraftResponse } from '../api/models/league-draft-response';

describe('DraftModeComponent following a Yahoo draft', () => {
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

  const handEnteredDraft: DraftState = {
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
      yahooSync: {
        leagueName: 'Beer League',
        leagueKey: '465.l.9',
        syncedAt: '2026-09-01T00:00:00Z',
      },
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
      { id: '465.l.9.t.2', name: 'Bravo', mine: false },
      { id: '465.l.9.t.1', name: 'Alpha', mine: true },
    ],
    picks,
  });

  const updateProjection =
    vi.fn<(id: string, request: UpdateProjectionRequest) => Observable<ProjectionResponse>>();
  const leagueDraftCall = vi.fn<(leagueKey: string) => Observable<LeagueDraftResponse>>();
  const leagueDraftSync = signal(true);
  let loaded: ProjectionResponse;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateProjection.mockReset();
    leagueDraftCall.mockReset();
    leagueDraftSync.set(true);
    loaded = projectionWith(handEnteredDraft);
    updateProjection.mockImplementation(() => of(loaded));
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, { loadProjection: () => of(loaded), updateProjection })
      .mock(FeatureService, { leagueDraftSync })
      .mock(YahooService, { leagueDraft: leagueDraftCall })
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

  const render = async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  it('is offered only where the feature is on and the draft has a Yahoo league', async () => {
    expect((await render()).canFollow()).toBe(true);

    leagueDraftSync.set(false);
    expect((await render()).canFollow()).toBe(false);

    leagueDraftSync.set(true);
    loaded = projectionWith({
      ...handEnteredDraft,
      settings: { ...handEnteredDraft.settings!, yahooSync: undefined },
    });
    expect((await render()).canFollow()).toBe(false);
  });

  it('says it is waiting, with your own seat, until the league draft has a pick', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();

    component.requestFollow();

    expect(component.awaitingLeagueDraft()).toBe(true);
    // The league gives the user's own seat; the seats around it are this board's own order.
    expect(component.myDraftPosition()).toEqual(2);

    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.awaitingLeagueDraft()).toBe(false);
    expect(component.upNextTeam()?.name).toEqual('Alpha');
  });

  it("takes the league's teams and picks, saves them, and locks pick edits", async () => {
    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    const component = await render();

    component.requestFollow();

    expect(leagueDraftCall).toHaveBeenCalledWith('465.l.9');
    expect(component.following()).toBe(true);
    expect(component.order()).toEqual(['465.l.9.t.2', '465.l.9.t.1']);
    expect(component.picks()).toEqual([{ playerId: 6743, teamId: '465.l.9.t.2' }]);
    expect(updateProjection).toHaveBeenCalledTimes(1);
    expect(updateProjection.mock.calls[0][1].data.draft?.settings?.yahooSync?.leagueKey).toBe(
      '465.l.9',
    );

    component.draftCurrent(7109);
    component.undoLast();
    expect(component.picks()).toHaveLength(1);
    expect(component.canUndo()).toBe(false);
  });

  it('picks up a new pick on the next poll and saves only when something changed', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();
    expect(updateProjection).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(updateProjection).toHaveBeenCalledTimes(1);

    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.picks()).toEqual([{ playerId: 6743, teamId: '465.l.9.t.2' }]);
    expect(updateProjection).toHaveBeenCalledTimes(2);

    component.stopFollowing();
    await vi.advanceTimersByTimeAsync(5000);
    expect(leagueDraftCall).toHaveBeenCalledTimes(3);
    expect(component.following()).toBe(false);
  });

  it('asks before replacing picks entered by hand', async () => {
    loaded = projectionWith({
      ...handEnteredDraft,
      picks: [{ playerId: 7109, teamId: 'team-me' }],
    });
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();

    component.requestFollow();
    expect(component.pendingFollow()).not.toBeNull();
    expect(component.following()).toBe(false);
    component.cancelFollow();
    expect(component.picks()).toHaveLength(1);

    component.requestFollow();
    component.confirmFollow();
    expect(component.following()).toBe(true);
    expect(component.picks()).toEqual([]);
  });

  it('does not follow an auction draft', async () => {
    leagueDraftCall.mockReturnValue(of({ ...leagueDraft(), auction: true }));
    const component = await render();

    component.requestFollow();

    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe("Draft Mode can't follow an auction draft.");
    expect(updateProjection).not.toHaveBeenCalled();
  });

  it('stops when the league draft is finished', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();

    leagueDraftCall.mockReturnValue(
      of({
        ...leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }]),
        status: 'FINISHED',
      }),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.picks()).toHaveLength(1);
    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe('The Yahoo draft is finished.');
  });

  it('keeps trying through a dropped connection but stops when Yahoo refuses', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();

    leagueDraftCall.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.following()).toBe(true);
    expect(component.followNotice()).toBe("Couldn't reach Yahoo. Trying again.");

    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.followNotice()).toBeNull();

    leagueDraftCall.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 424 })));
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe("Yahoo refused access to this league's draft.");
  });
});
