import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PreviewSource, StartingPointPreviewComponent } from './starting-point-preview';
import { ProjectionsTableHeaderComponent } from '../../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { ProjectionBoardCache } from '../../services/projection-board-cache';
import { PlayerService } from '../../services/player.service';
import { ProjectionModelService } from '../../services/projection-model.service';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { StatInfoService } from '../../services/stat-info.service';
import { Goalie, Player, Skater } from '../../models/player.model';
import { SkaterPosition } from '../../models/position.model';
import { GoalieScoringStats, SkaterScoringStats } from '../../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../../models/stat-key.model';
import { ProjectionResponse } from '../../api/models/projection-response';
import { SeededProjectionResponse } from '../../api/models/seeded-projection-response';
import { ModelBoardResponse } from '../../api/models/model-board-response';
import { PlayerProjection } from '../../api/models/player-projection';
import { AiProjectionAccess } from '../premium/ai-projection-access';
import { squaredWithPool } from '../pool-line';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../../draft-projection/projection-settings-section/model';
import { readableDecimalSettings } from '../../draft-projection/projection-settings-section/model-decimals';

describe('StartingPointPreviewComponent', () => {
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
      },
    },
  });

  const players = [
    skater(1, 'Best Player', 60),
    skater(2, 'Second Player', 50),
    skater(3, 'Third Player', 40),
    skater(4, 'Fourth Player', 30),
    skater(5, 'Fifth Player', 20),
    skater(6, 'Sixth Player', 10),
  ];

  /** The model rates the same players in the opposite order, so its preview cannot be mistaken. */
  const seeded: SeededProjectionResponse = {
    season: 2026,
    modelVersion: 'test-1',
    skaters: 700,
    goalies: 70,
    unmapped: 0,
    goaliesWithoutWorkload: 0,
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
        },
      },
    })),
  };

  const board: ProjectionResponse = {
    id: 'b1',
    kind: 'projection',
    name: 'A board',
    season: '20262027',
    autoNamed: false,
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
          playerId: 2,
          type: 'skater',
          stats: { utility: { gp: 82 }, scoring: { goals: 64 } },
        },
      ],
    },
  };

  const seed = vi.fn<() => Observable<SeededProjectionResponse>>(() => of(seeded));
  const modelBoard = vi.fn<() => Observable<ModelBoardResponse>>();
  const loadProjection = vi.fn<() => Observable<ProjectionResponse>>(() => of(board));
  const getPlayers = vi.fn<(limits?: { skaters: number; goalies: number }) => Observable<Player[]>>(
    () => of(players),
  );
  /** Free unless a test says otherwise: most of what is tested here is the teaser. */
  const readsWholeBoard = signal<boolean | null>(false);

  interface PreviewParams {
    source: PreviewSource | null;
    fallbackNote: string | null;
  }

  const template = `<app-starting-point-preview [source]="source" [fallbackNote]="fallbackNote" />`;

  const render = (params: Partial<PreviewParams> = {}) =>
    MockRender<unknown, PreviewParams>(template, {
      source: null,
      fallbackNote: null,
      ...params,
    });

  const previewOf = (fixture: ReturnType<typeof render>) =>
    ngMocks.find(fixture.debugElement, StartingPointPreviewComponent).componentInstance;

  beforeEach(() => {
    seed.mockClear();
    modelBoard.mockReset();
    loadProjection.mockClear();
    getPlayers.mockReset();
    getPlayers.mockImplementation(() => of(players));
    readsWholeBoard.set(false);
    return MockBuilder(StartingPointPreviewComponent)
      .keep(ProjectionBoardCache)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(ProjectionSerializerService)
      .keep(StatInfoService)
      .mock(ProjectionModelService, { seed, board: modelBoard })
      .mock(AiProjectionAccess, { readsWholeBoard })
      .mock(PlayerService, { getPlayers, getRookieIds: () => of(new Set<number>()) })
      .mock(ProjectionStorageService, { loadProjection });
  });

  it('draws nothing until something is picked', async () => {
    const fixture = render({ fallbackNote: 'Nothing to copy yet.' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(previewOf(fixture).previewRows()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.preview-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.preview-note').textContent).toContain(
      'Nothing to copy yet.',
    );
  });

  it("previews a preset out of the top of last season's pool", async () => {
    const fixture = render({ source: { kind: 'preset', preset: 'default' } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      previewOf(fixture)
        .previewRows()
        .map((row) => row.player.name),
    ).toEqual(['Best Player', 'Second Player', 'Third Player', 'Fourth Player', 'Fifth Player']);
    expect(fixture.nativeElement.querySelector('.preview-card')).not.toBeNull();
  });

  /** Only the slice the BFF serves without a subscription — see PREVIEW_FETCH_LIMITS. */
  it("ranks the model's own lines under the AI preset, asking only for the top of them", async () => {
    const fixture = render({ source: { kind: 'preset', preset: 'model' } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(seed).toHaveBeenCalledWith({ skaterLimit: 25, goalieLimit: 1 });
    // The model's order, which is the reverse of last season's.
    expect(
      previewOf(fixture)
        .previewRows()
        .map((row) => row.player.name),
    ).toEqual(['Sixth Player', 'Fifth Player', 'Fourth Player']);
  });

  /**
   * The model reads a player's type from the NHL and the pool from ESPN, which has listed a goalie
   * as a centre. A goalie line drawn in a skater's row holds none of the stats its cells read.
   */
  it("gives a player the pool's own line when the model has them as the other type", async () => {
    const goalieLine = {
      playerId: 6,
      type: 'goalie' as const,
      stats: { utility: { gp: 10 }, scoring: { w: 4, gs: 10 } },
    };
    seed.mockReturnValueOnce(
      of({
        ...seeded,
        players: [...seeded.players.filter((p) => p.playerId !== 6), goalieLine],
      }),
    );
    const fixture = render({ source: { kind: 'preset', preset: 'model' } });
    await fixture.whenStable();
    fixture.detectChanges();

    const row = previewOf(fixture)
      .previewRows()
      .find((r) => r.player.id === 6);
    expect(row?.projection).toEqual({ type: 'skater', playerId: 6, stats: players[5].stats });
  });

  it('says what the model is made of, under the model and nowhere else', async () => {
    const fixture = render({ source: { kind: 'preset', preset: 'default' } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('MoneyPuck');

    fixture.componentInstance.source = { kind: 'preset', preset: 'model' };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.preview-note').textContent).toContain(
      'Data © MoneyPuck.com',
    );
  });

  it('credits MoneyPuck and makes no claim about what kind of number a row is', async () => {
    // The rows stopped being expected seasons at projection-service marcel-v88: they are lifted
    // toward what each rank of a season takes, so "leaders finish above their projection" would
    // now be wrong about the very rows it sits under.
    const fixture = render({ source: { kind: 'preset', preset: 'model' } });
    await fixture.whenStable();
    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector('.preview-note').textContent;
    expect(note.replace(/\s+/g, ' ').trim()).toBe(
      'The AI projection uses advanced stats from MoneyPuck. Data © MoneyPuck.com.',
    );
  });

  it('empties every row under From scratch, and asks the model for nothing', async () => {
    const fixture = render({ source: { kind: 'preset', preset: 'blank' } });
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = previewOf(fixture).previewRows();
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.score.fantasyPoints === 0)).toBe(true);
    expect(seed).not.toHaveBeenCalled();
  });

  it("previews a board with the board's own numbers and settings", async () => {
    const fixture = render({ source: { kind: 'board', id: 'b1' } });
    await fixture.whenStable();
    fixture.detectChanges();

    const preview = previewOf(fixture);
    const rows = preview.previewRows();
    expect(rows.map((row) => row.player.name)).toEqual(['Second Player']);
    // 64, the board's own number, not the 50 last season gave the same player.
    expect((rows[0].projection.stats.scoring as SkaterScoringStats).goals).toEqual(64);
    expect(preview.previewScoringType()).toEqual('category');
    expect([...preview.previewActiveColumns().scoring]).toEqual(['goals']);
  });

  /** Decoration: a board that will not download costs the table, and says so in the page's words. */
  it("falls back to the page's note when a board will not download", async () => {
    loadProjection.mockImplementation(() =>
      throwError(() => new HttpErrorResponse({ status: 502 })),
    );

    const fixture = render({
      source: { kind: 'board', id: 'b1' },
      fallbackNote: 'Starts as an exact copy of A board, using its saved numbers.',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(previewOf(fixture).hasFailed()).toBe(true);
    expect(fixture.nativeElement.querySelector('.preview-note').textContent).toContain(
      'exact copy of A board',
    );
    expect(fixture.nativeElement.querySelector('.preview-card')).toBeNull();
  });

  /**
   * A preview is read for its Total Points column, and 4.5 a goal against 6 is the difference
   * between two different boards. The row is the editor's own, minus the inputs.
   */
  it('says what the totals were scored with', async () => {
    const fixture = render({ source: { kind: 'preset', preset: 'default' } });
    await fixture.whenStable();
    fixture.detectChanges();

    const header = ngMocks.find(fixture.debugElement, ProjectionsTableHeaderComponent);
    expect(ngMocks.input(header, 'showWeights')).toBe(true);
    expect(ngMocks.input(header, 'readonly')).toBe(true);
    expect(ngMocks.input(header, 'sortable')).toBe(false);
  });

  describe('the AI preset', () => {
    const goalie = (id: number, name: string, wins: number): Goalie => ({
      type: 'goalie',
      id,
      name,
      teamAbbrev: 'TBL',
      stats: {
        utility: { gp: 60 },
        scoring: {
          ...(Object.fromEntries(
            GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0]),
          ) as GoalieScoringStats),
          w: wins,
        },
      },
    });

    const skaterLine = (id: number, goals: number): PlayerProjection => ({
      playerId: id,
      type: 'skater',
      stats: {
        utility: { gp: 82, toiPerGame: 1200 },
        scoring: {
          ...(Object.fromEntries(SKATER_SCORING_STAT_KEYS.map((key) => [key, 0])) as Record<
            string,
            number
          >),
          goals,
          assists: 40,
        },
      },
    });

    const goalieLine = (id: number, wins: number): PlayerProjection => ({
      playerId: id,
      type: 'goalie',
      stats: {
        utility: { gp: 60 },
        scoring: {
          ...(Object.fromEntries(GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0])) as Record<
            string,
            number
          >),
          w: wins,
        },
      },
    });

    /**
     * The case the teaser got wrong. Deep Skater is outside the top of last season's pool, so the
     * old preview, which ranked only what the pool's top and the model's top had in common, left
     * him out and put Vasilevskiy third. On the board Create writes he is there — the reconciler
     * backfills everyone the model does not reach — and outscores the goalie.
     */
    const vasilevskiy = goalie(7, 'Andrei Vasilevskiy', 80);
    const deepSkater = skater(8, 'Deep Skater', 5);
    const wholePool: Player[] = [...players, deepSkater, vasilevskiy];
    const topOfPool: Player[] = [...players, vasilevskiy];
    const createdBoard: ModelBoardResponse = {
      players: [
        ...[1, 2, 3, 4, 5, 6].map((id) => skaterLine(id, id * 10)),
        goalieLine(7, 80),
        // Last season's line in the pool says 5 goals; the board's row is what counts.
        skaterLine(8, 55),
        // A row the pool no longer holds: the editor does not open it, so neither may the preview.
        skaterLine(99, 500),
      ],
    };

    const givenThePools = () =>
      getPlayers.mockImplementation((limits) => of(limits ? topOfPool : wholePool));

    /** What the editor ranks when it opens the board: its rows the pool holds, squared with it. */
    const editorOrder = (scoringType: 'points' | 'category') => {
      const byId = new Map(wholePool.map((player) => [player.id, player]));
      const serializer = TestBed.inject(ProjectionSerializerService);
      const projections = createdBoard.players
        .filter((row) => byId.has(row.playerId))
        .map((row) => squaredWithPool(serializer.toProjection(row), byId.get(row.playerId)));
      return TestBed.inject(ProjectionRankingService)
        .rankOverall({
          projections,
          scoringType,
          statWeights: DEFAULT_STAT_WEIGHTS,
          activeScoringColumns: new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS),
          leagueSize: DEFAULT_LEAGUE_SIZE,
          rosterSlots: DEFAULT_ROSTER_SLOTS,
          minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
          decimalSettings: readableDecimalSettings(projections, DEFAULT_DECIMAL_SETTINGS, true),
        })
        .slice(0, 5)
        .map((scored) => byId.get(scored.projection.playerId)?.name);
    };

    describe('for an account that reads the whole board', () => {
      beforeEach(() => {
        readsWholeBoard.set(true);
        givenThePools();
        modelBoard.mockImplementation(() => of(createdBoard));
      });

      it("ranks the board Create writes, so its top five are the editor's", async () => {
        const fixture = render({ source: { kind: 'preset', preset: 'model' } });
        await fixture.whenStable();
        fixture.detectChanges();

        const rows = previewOf(fixture).previewRows();
        expect(rows.map((row) => row.player.name)).toEqual([
          'Sixth Player',
          'Deep Skater',
          'Fifth Player',
          'Andrei Vasilevskiy',
          'Fourth Player',
        ]);
        expect(rows.map((row) => row.player.name)).toEqual(editorOrder('points'));
        expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
        // The board's own number for the backfilled skater, not last season's.
        const deep = rows.find((row) => row.player.id === 8);
        expect((deep?.projection.stats.scoring as SkaterScoringStats).goals).toEqual(55);
        expect(seed).not.toHaveBeenCalled();
      });

      /** In category scoring every z-score depends on who else is on the board. */
      it("matches the editor's order in a category league too", async () => {
        const fixture = MockRender<unknown, PreviewParams & { league: unknown }>(
          `<app-starting-point-preview [source]="source" [fallbackNote]="fallbackNote" [leagueSettings]="league" />`,
          {
            source: { kind: 'preset', preset: 'model' },
            fallbackNote: null,
            league: { scoringType: 'category' },
          },
        );
        await fixture.whenStable();
        fixture.detectChanges();

        expect(
          previewOf(fixture)
            .previewRows()
            .map((row) => row.player.name),
        ).toEqual(editorOrder('category'));
      });

      it('asks for the board afresh each time the preset is picked, never from a copy', async () => {
        const fixture = render({ source: { kind: 'preset', preset: 'model' } });
        await fixture.whenStable();
        fixture.componentInstance.source = { kind: 'preset', preset: 'default' };
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.componentInstance.source = { kind: 'preset', preset: 'model' };
        fixture.detectChanges();
        await fixture.whenStable();

        expect(modelBoard).toHaveBeenCalledTimes(2);
      });

      it('falls back to the note when the board will not download', async () => {
        modelBoard.mockImplementation(() =>
          throwError(() => new HttpErrorResponse({ status: 502 })),
        );
        const fixture = render({ source: { kind: 'preset', preset: 'model' } });
        await fixture.whenStable();
        fixture.detectChanges();

        expect(previewOf(fixture).hasFailed()).toBe(true);
        expect(fixture.nativeElement.querySelector('.preview-card')).toBeNull();
      });
    });

    describe('for a free account', () => {
      beforeEach(() => {
        givenThePools();
        seed.mockImplementation(() =>
          of({ ...seeded, players: [...createdBoard.players.slice(0, 7)] }),
        );
      });

      /** Alexander's call, 2026-09-24: the teaser ranks skaters only, numbered among themselves. */
      it('previews skaters only, numbered one to five among them', async () => {
        const fixture = render({ source: { kind: 'preset', preset: 'model' } });
        await fixture.whenStable();
        fixture.detectChanges();

        const rows = previewOf(fixture).previewRows();
        expect(rows.map((row) => row.player.type)).toEqual(Array(5).fill('skater'));
        expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
        expect(rows.map((row) => row.player.name)).toEqual([
          'Sixth Player',
          'Fifth Player',
          'Fourth Player',
          'Third Player',
          'Second Player',
        ]);
        expect(modelBoard).not.toHaveBeenCalled();
      });

      it('previews skaters only in a category league as well', async () => {
        const fixture = MockRender<unknown, PreviewParams & { league: unknown }>(
          `<app-starting-point-preview [source]="source" [fallbackNote]="fallbackNote" [leagueSettings]="league" />`,
          {
            source: { kind: 'preset', preset: 'model' },
            fallbackNote: null,
            league: { scoringType: 'category' },
          },
        );
        await fixture.whenStable();
        fixture.detectChanges();

        const rows = previewOf(fixture).previewRows();
        expect(rows).toHaveLength(5);
        expect(rows.every((row) => row.player.type === 'skater')).toBe(true);
        expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
      });
    });

    /** The entitlement says non-premium until it lands; a subscriber must not get the teaser first. */
    it('fetches nothing of the model until the entitlement has landed', async () => {
      readsWholeBoard.set(null);
      const fixture = render({ source: { kind: 'preset', preset: 'model' } });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(previewOf(fixture).isLoading()).toBe(true);
      expect(seed).not.toHaveBeenCalled();
      expect(modelBoard).not.toHaveBeenCalled();
    });
  });
});
