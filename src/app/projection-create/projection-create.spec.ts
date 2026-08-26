import { MockBuilder, MockInstance, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ProjectionCreateComponent } from './projection-create';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { StatInfoService } from '../services/stat-info.service';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionCalculationService } from '../services/projection-calculation.service';
import { Goalie, Skater } from '../models/player.model';
import { SkaterPosition } from '../models/position.model';
import { GoalieScoringStats, SkaterScoringStats } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';

describe('ProjectionCreateComponent', () => {
  MockInstance.scope();

  const created: ProjectionResponse = {
    id: 'new-id',
    kind: 'projection',
    name: 'Dynasty',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: { settings: {} as never, players: [] },
  };

  const source: ProjectionResponse = {
    id: 'src',
    kind: 'projection',
    name: 'Source',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: {
      settings: {
        scoringType: 'category',
        statWeights: { goals: 5 },
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0 },
        useDefaultDecimals: false,
        leagueSize: 10,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 2, g: 2 },
        minGoalieGames: 25,
      },
      players: [
        {
          playerId: 1,
          type: 'skater',
          stats: {
            utility: { gp: 82 },
            scoring: {
              stpg: 0,
              stpa: 0,
              stp: 0,
              hatTricks: 0,
              defPoints: 0,
              shifts: 0,
              toi: 0,
              goals: 64,
            },
          },
        },
      ],
    },
  };

  const summary: ProjectionSummaryResponse = {
    id: 'p1',
    kind: 'projection',
    name: 'My Projection',
    draftStatus: 'none',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };

  const skater = (id: number, name: string, goals: number): Skater => ({
    type: 'skater',
    id,
    name,
    teamAbbrev: 'TOR',
    positions: new Set<SkaterPosition>(['C']),
    stats: {
      utility: { gp: 82, toiPerGame: 1200 },
      scoring: {
        ...(Object.fromEntries(
          SKATER_SCORING_STAT_KEYS.map((key) => [key, 0]),
        ) as SkaterScoringStats),
        goals,
        assists: 40,
        // Inverse to the goals, so sorting by hits is a different five in a different order.
        hits: 100 - goals,
      },
    },
  });

  // Enough games to be a qualified starter, but a modest enough season to rank below every
  // skater — which is what makes the reserved goalie row worth having.
  const goalie: Goalie = {
    type: 'goalie',
    id: 7,
    name: 'Only Goalie',
    teamAbbrev: 'WPG',
    stats: {
      utility: { gp: 40 },
      scoring: {
        ...(Object.fromEntries(
          GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0]),
        ) as GoalieScoringStats),
        w: 1,
        sv: 10,
        ga: 5,
      },
    },
  };

  const skaters = [
    skater(1, 'Best Player', 60),
    skater(2, 'Second Player', 50),
    skater(3, 'Third Player', 40),
    skater(4, 'Fourth Player', 30),
    skater(5, 'Fifth Player', 20),
    skater(6, 'Sixth Player', 10),
  ];

  const players = [...skaters, goalie];

  const navigate = vi.fn();
  const createProjection = vi.fn<
    (request: CreateProjectionRequest) => Observable<ProjectionResponse>
  >(() => of(created));

  beforeEach(() => {
    navigate.mockClear();
    createProjection.mockClear();
    return MockBuilder(ProjectionCreateComponent)
      .keep(StatInfoService)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .mock(PlayerService, {
        getPlayers: () => of(players),
        getRookieIds: () => of(new Set([3])),
      })
      .mock(ProjectionStorageService, {
        listProjections: () => of([]),
        createProjection,
        loadProjection: () => of(source),
      })
      .provide({ provide: Router, useValue: { navigate } });
  });

  it('loads the existing projections', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    expect(fixture.point.componentInstance.isLoading()).toEqual(false);
  });

  it('prefills the name with a suggestion and requires one to create', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.name()).toEqual('My Projection');
    expect(component.canCreate()).toEqual(true);
    component.name.set('   ');
    expect(component.canCreate()).toEqual(false);
  });

  it('suffixes the suggested name when it is already taken', async () => {
    MockInstance(
      ProjectionStorageService,
      'listProjections',
      vi.fn(() =>
        of([
          { ...summary, id: 'p1', name: 'My Projection' },
          { ...summary, id: 'p2', name: 'My Projection 2' },
        ]),
      ),
    );

    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.name()).toEqual('My Projection 3');
  });

  it('creates a projection and navigates to edit mode', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.name.set('Dynasty');
    component.create();

    expect(createProjection).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new-id']);
  });

  it('redirects to the list when the server rejects a second projection (409)', async () => {
    createProjection.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.name.set('Dynasty');
    component.create();

    expect(navigate).toHaveBeenCalledWith(['/projections']);
  });

  it('creates from scratch with default (points) settings', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.create();

    expect(createProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({ scoringType: 'points' }),
        }),
      }),
    );
  });

  // The player rows are ~0.5 MB the client had just downloaded, and uploading them back was
  // failing outright for at least one user in production. The server derives them from source.
  it('asks the server to fill in the players instead of uploading them', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.create();

    const request = createProjection.mock.calls[0][0];
    expect(request.source).toEqual('default');
    expect(request.data.players).toEqual([]);
  });

  it('asks for zeroed players when creating a blank projection', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('blank');
    component.create();

    expect(createProjection.mock.calls[0][0].source).toEqual('blank');
  });

  // A copy carries rows that only the client has, so it must keep sending them.
  it('sends no source when copying an existing projection', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('copy');
    component.copyFromId.set('src');
    component.create();

    expect(createProjection.mock.calls[0][0].source).toBeUndefined();
  });

  it('copies the source projection data (settings and players) verbatim', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('copy');
    component.copyFromId.set('src');
    component.create();

    expect(createProjection).toHaveBeenCalledWith(expect.objectContaining({ data: source.data }));
  });

  // Four skaters and the goalie, which is the whole point of the reserved row: the board's own
  // top five is all skaters, and the goalie columns would stand empty.
  const topFive = ['Best Player', 'Second Player', 'Third Player', 'Fourth Player', 'Only Goalie'];

  it('previews the top players with the stats last season gave them', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    const rows = component.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual(topFive);
    // The goalie keeps the rank it holds on the whole board, rather than being renumbered 5.
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 7]);
    expect(rows[0].projection.stats.scoring).toEqual(
      expect.objectContaining({ goals: 60, assists: 40 }),
    );
    expect(rows[0].projection.stats.utility.gp).toEqual(82);
    expect(rows[0].score.fantasyPoints).toBeGreaterThan(0);
    expect(rows[4].projection.stats.scoring).toEqual(
      expect.objectContaining({ w: 1, sv: 10, ga: 5 }),
    );
    expect(rows[4].belowMinGames).toEqual(false);
  });

  // The goalie minimum is a category-league rule (see ProjectionRankingService.isQualified), and
  // a new projection opens in points mode — so the preview must not put the editor's
  // "Below min. games" marker on a goalie who would never carry one there.
  it('leaves a barely-played goalie unmarked, as points scoring does', async () => {
    MockInstance(
      PlayerService,
      'getPlayers',
      vi.fn(() => of([...skaters, { ...goalie, stats: { ...goalie.stats, utility: { gp: 5 } } }])),
    );

    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    const goalieRow = fixture.point.componentInstance.previewRows()[4];
    expect(goalieRow.player.name).toEqual('Only Goalie');
    expect(goalieRow.belowMinGames).toEqual(false);
  });

  // The preview shows the columns the editor opens with — the goalie ones included, so they read
  // as the editor's empty cells rather than being quietly left out.
  it('previews the columns a new projection opens with', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect([...component.previewActiveColumns.utility]).toEqual(['gp']);
    expect([...component.previewActiveColumns.scoring]).toEqual([
      'goals',
      'assists',
      'ppp',
      'hits',
      'blocks',
      'w',
      'sv',
      'ga',
    ]);
  });

  // Same players in the same rows, emptied — the point of the preview is that only the numbers
  // change, so the score has to go to zero with the stats that produced it.
  it('zeroes every previewed stat and score when starting from scratch', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('blank');

    const rows = component.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual(topFive);
    const values = rows.flatMap((row) => [
      ...Object.values(row.projection.stats.scoring),
      ...Object.values(row.projection.stats.utility),
      row.score.fantasyPoints,
      row.score.zScore,
    ]);
    expect(values.every((value) => value === 0)).toEqual(true);
    // Nobody is projected for any games yet, so the goalie is not called short of them either.
    expect(rows.some((row) => row.belowMinGames)).toEqual(false);
  });

  // Sorting five rows would show the wrong five players: the whole pool is sorted, then cut.
  it('re-picks the top five when the header sorts by another column', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.onPreviewSort('hits');

    expect(component.previewSortDirection()).toEqual('desc');
    const rows = component.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual([
      'Sixth Player',
      'Fifth Player',
      'Fourth Player',
      'Third Player',
      // The goalie has no hits at all, so it is still lifted in — from the bottom of this order.
      'Only Goalie',
    ]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 7]);

    component.onPreviewSort('hits');

    expect(component.previewSortDirection()).toEqual('asc');
    expect(component.previewRows()[0].player.name).toEqual('Only Goalie');
  });

  it('marks the rookies the editor would mark', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    const rows = fixture.point.componentInstance.previewRows();
    expect(rows.filter((row) => row.rookie).map((row) => row.player.name)).toEqual([
      'Third Player',
    ]);
  });

  // A failed player read model is not a reason to block the form: the preview is decoration.
  it('still lets you create when the preview cannot load', async () => {
    MockInstance(
      PlayerService,
      'getPlayers',
      vi.fn(() => throwError(() => new HttpErrorResponse({ status: 502 }))),
    );

    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.previewFailed()).toEqual(true);
    expect(component.loadError()).toEqual(false);
    expect(component.canCreate()).toEqual(true);
  });
});
