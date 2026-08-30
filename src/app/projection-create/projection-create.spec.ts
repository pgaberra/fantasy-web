import { MockBuilder, MockInstance, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { CREATE_PRESETS, ProjectionCreateComponent } from './projection-create';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { StatInfoService } from '../services/stat-info.service';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { PlayerService } from '../services/player.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionModelService } from '../services/projection-model.service';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';
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

  // The model reaches three of the six skaters and none of the goalie, and rates them in the
  // opposite order to last season — so a preview drawn from it cannot be mistaken for the
  // last-season one.
  const seeded: SeededProjectionResponse = {
    season: 2026,
    modelVersion: 'test-1',
    skaters: 3,
    goalies: 0,
    unmapped: 0,
    goaliesWithoutWorkload: 2,
    players: [4, 5, 6].map((id) => ({
      playerId: id,
      type: 'skater' as const,
      stats: {
        utility: { gp: 82, toiPerGame: 1200 },
        scoring: {
          ...(Object.fromEntries(SKATER_SCORING_STAT_KEYS.map((key) => [key, 0])) as Record<
            string,
            number
          >),
          goals: id * 10,
          assists: 40,
          hits: 0,
        },
      },
    })),
  };

  const seed = vi.fn<() => Observable<SeededProjectionResponse>>(() => of(seeded));

  const navigate = vi.fn();
  const notifyError = vi.fn();
  const createProjection = vi.fn<
    (request: CreateProjectionRequest) => Observable<ProjectionResponse>
  >(() => of(created));

  beforeEach(() => {
    navigate.mockClear();
    notifyError.mockClear();
    createProjection.mockClear();
    seed.mockClear();
    return MockBuilder(ProjectionCreateComponent)
      .keep(StatInfoService)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(ProjectionSerializerService)
      .mock(ProjectionModelService, { seed })
      .mock(PlayerService, {
        getPlayers: () => of(players),
        getRookieIds: () => of(new Set([3])),
      })
      .mock(ProjectionStorageService, {
        listEditable: () => of([]),
        createProjection,
        loadProjection: () => of(source),
      })
      .mock(NotificationService, { error: notifyError })
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
      'listEditable',
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

  // Names are unique per user, and the name is a field on this page, so a clash is something to
  // say here rather than a reason to leave.
  it('says the name is taken when the server rejects it (409), and stays put', async () => {
    createProjection.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.name.set('Dynasty');
    component.create();

    expect(notifyError).toHaveBeenCalledWith('You already have a projection with that name.');
    expect(navigate).not.toHaveBeenCalled();
    expect(component.isCreating()).toEqual(false);
  });

  describe('the three groups of starting points', () => {
    const listed = [
      { ...summary, id: 'own1', kind: 'projection' as const, name: 'Dynasty' },
      {
        ...summary,
        id: 'shared1',
        kind: 'imported' as const,
        name: "Alex's board",
        origin: { shareToken: 'tok', authorUsername: 'alex' },
      },
    ];

    it('splits what the user has into their own and what was shared with them', async () => {
      MockInstance(
        ProjectionStorageService,
        'listEditable',
        vi.fn(() => of(listed)),
      );

      const fixture = MockRender(ProjectionCreateComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      expect(component.ownProjections().map((row) => row.id)).toEqual(['own1']);
      expect(component.importedBoards().map((row) => row.id)).toEqual(['shared1']);
      expect(component.sourceLabel(listed[1])).toEqual('From alex');
    });

    it('opens on the presets, with last season picked', async () => {
      const fixture = MockRender(ProjectionCreateComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      expect(component.selectedTab()).toEqual('presets');
      expect(component.selectedPreset()).toEqual('default');
      expect(component.canCreate()).toEqual(true);
    });

    // What a preset means is a tip on the row, not a line under the name: three subtitles made
    // the strip's own choices louder than the projections listed beside them.
    it('explains each preset in a tip rather than a subtitle', async () => {
      const fixture = MockRender(ProjectionCreateComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.panel');
      expect(panel.querySelectorAll('app-help-tip')).toHaveLength(CREATE_PRESETS.length);
      expect(panel.querySelector('.row-meta')).toBeNull();
    });

    it('waits for a row to be picked before it can create from a copy', async () => {
      MockInstance(
        ProjectionStorageService,
        'listEditable',
        vi.fn(() => of(listed)),
      );

      const fixture = MockRender(ProjectionCreateComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      component.selectTab('imported');
      expect(component.canCreate()).toEqual(false);

      component.selectCopyFrom('shared1');
      expect(component.canCreate()).toEqual(true);
    });

    // A copy carries rows only the client has, whoever made them — the same path the user's own
    // projections take, which is the point of listing both as starting points.
    it('copies a shared board verbatim, sending no source', async () => {
      MockInstance(
        ProjectionStorageService,
        'listEditable',
        vi.fn(() => of(listed)),
      );

      const fixture = MockRender(ProjectionCreateComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      component.selectTab('imported');
      component.selectCopyFrom('shared1');
      component.create();

      expect(createProjection).toHaveBeenCalledWith(
        expect.objectContaining({ data: source.data, source: undefined }),
      );
    });

    it('picks a board the moment it is imported, and re-reads the list it belongs in', async () => {
      const listEditable = vi.fn(() => of(listed));
      MockInstance(ProjectionStorageService, 'listEditable', listEditable);

      const fixture = MockRender(ProjectionCreateComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      component.onImported({ id: 'fresh1' } as ProjectionResponse);
      await fixture.whenStable();

      expect(component.copyFromId()).toEqual('fresh1');
      expect(listEditable).toHaveBeenCalledTimes(2);
    });
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

    component.selectPreset('blank');
    component.create();

    expect(createProjection.mock.calls[0][0].source).toEqual('blank');
  });

  // A copy carries rows that only the client has, so it must keep sending them.
  it('sends no source when copying an existing projection', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.selectTab('own');
    component.selectCopyFrom('src');
    component.create();

    expect(createProjection.mock.calls[0][0].source).toBeUndefined();
  });

  it('copies the source projection data (settings and players) verbatim', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.selectTab('own');
    component.selectCopyFrom('src');
    component.create();

    expect(createProjection).toHaveBeenCalledWith(expect.objectContaining({ data: source.data }));
  });

  // The board's own top five, whoever they turn out to be. Under these stats that is all
  // skaters — the goalie ranks below them and is not lifted into the last seat.
  const topFive = ['Best Player', 'Second Player', 'Third Player', 'Fourth Player', 'Fifth Player'];

  it('previews the top players with the stats last season gave them', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    const rows = component.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual(topFive);
    // Numbered by their place in the preview, the way the editor numbers its own view.
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0].projection.stats.scoring).toEqual(
      expect.objectContaining({ goals: 60, assists: 40 }),
    );
    expect(rows[0].projection.stats.utility.gp).toEqual(82);
    expect(rows[0].score.fantasyPoints).toBeGreaterThan(0);
    expect(rows.every((row) => row.player.type === 'skater')).toBe(true);
  });

  // The goalie minimum is a category-league rule (see ProjectionRankingService.isQualified), and
  // a new projection opens in points mode — so the preview must not put the editor's
  // "Below min. games" marker on a goalie who would never carry one there.
  it('leaves a barely-played goalie unmarked, as points scoring does', async () => {
    // A board short enough that the goalie is in the preview on its own merits — there is no
    // reserved seat lifting it in any more.
    MockInstance(
      PlayerService,
      'getPlayers',
      vi.fn(() =>
        of([...skaters.slice(0, 3), { ...goalie, stats: { ...goalie.stats, utility: { gp: 5 } } }]),
      ),
    );

    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    const goalieRow = fixture.point.componentInstance
      .previewRows()
      .find((row) => row.player.name === 'Only Goalie');
    expect(goalieRow).toBeDefined();
    expect(goalieRow?.belowMinGames).toEqual(false);
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

    component.selectPreset('blank');

    const rows = component.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual(topFive);
    const values = rows.flatMap((row) => [
      ...Object.values(row.projection.stats.scoring),
      ...Object.values(row.projection.stats.utility),
      row.score.fantasyPoints,
      row.score.zScore,
    ]);
    expect(values.every((value) => value === 0)).toEqual(true);
    // Nobody is projected for any games yet, so nobody is called short of them either.
    expect(rows.some((row) => row.belowMinGames)).toEqual(false);
  });

  // Five rows do not need the pool. Asking for it was half a megabyte to draw them.
  it('downloads only the top of the board', async () => {
    const getPlayers = vi.fn(() => of(players));
    MockInstance(PlayerService, 'getPlayers', getPlayers);

    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    expect(getPlayers).toHaveBeenCalledWith({ skaters: 25, goalies: 10 });
    expect(fixture.point.componentInstance.previewRows()).toHaveLength(5);
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

  it("asks the server for the model's lines when the AI preset is picked", async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.name.set('Dynasty');
    component.selectPreset('model');
    await fixture.whenStable();
    component.create();

    expect(createProjection.mock.calls[0][0].source).toEqual('model');
  });

  // Five rows do not need the model's whole board either, the same reason the pool is asked
  // for a slice. The counts still cover the league, which is what the note under it reports.
  it('asks the model for the same slice of the board the pool is asked for', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.selectPreset('model');
    await fixture.whenStable();

    expect(seed).toHaveBeenCalledWith({ skaterLimit: 25, goalieLimit: 10 });
    expect(fixture.point.componentInstance.modelCoverage()).toEqual({ skaters: 3, goalies: 0 });
  });

  it('does not download the model until the AI preset is picked', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    expect(seed).not.toHaveBeenCalled();

    fixture.point.componentInstance.selectPreset('model');
    await fixture.whenStable();

    expect(seed).toHaveBeenCalledOnce();
  });

  // The server seeds a model projection with the players the model reached and no others, so a
  // preview showing the rest — filled in, or dashed — would promise rows the editor will not have.
  it("previews only the players the model reached, in the model's own order", async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.selectPreset('model');
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = component.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual([
      'Sixth Player',
      'Fifth Player',
      'Fourth Player',
    ]);
    // Last season had these three last, and the goalie is absent because the model has no line
    // for it.
    expect(rows.every((row) => row.player.type === 'skater')).toBe(true);
  });

  it("scores the preview on the model's numbers, not last season's", async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    const lastSeason = component.previewRows().find((row) => row.player.id === 6);
    component.selectPreset('model');
    await fixture.whenStable();
    const projected = component.previewRows().find((row) => row.player.id === 6);

    expect(lastSeason).toBeUndefined();
    expect(projected?.projection.type).toEqual('skater');
    expect((projected?.projection.stats.scoring as SkaterScoringStats).goals).toEqual(60);
    expect(projected?.score.fantasyPoints).toBeGreaterThan(0);
  });

  it('says how much of the league the model reached', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.modelCoverage()).toBeNull();

    component.selectPreset('model');
    await fixture.whenStable();

    expect(component.modelCoverage()).toEqual({ skaters: 3, goalies: 0 });
  });
});
