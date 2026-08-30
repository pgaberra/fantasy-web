import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnalyticsService } from '../services/analytics.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { StatInfoService } from '../services/stat-info.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { Player } from '../models/player.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import {
  ActiveColumns,
  GoalieScoringStats,
  GoalieStats,
  PlayerScore,
  Projection,
  SkaterScoringStats,
  SkaterStats,
} from '../models/projection.model';
import { PlayerRowComponent } from '../draft-projection/player-projections-table/player-row/player-row';
import { ProjectionsTableHeaderComponent } from '../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionData } from '../api/models/projection-data';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import {
  createDefaultProjectionState,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionModelService } from '../services/projection-model.service';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';

type DataSource = 'last-season' | 'ai' | 'blank' | 'copy';

/**
 * What each starting point sends as `source`. 'copy' is absent on purpose: it uploads rows
 * taken from another projection rather than asking the server to derive them.
 */
const SOURCE_BY_CHOICE: Record<Exclude<DataSource, 'copy'>, CreateProjectionRequest['source']> = {
  'last-season': 'default',
  ai: 'model',
  blank: 'blank',
};

/**
 * How many rows the preview shows. Enough to see what the editor opens as — the columns, the
 * order, whether the numbers are real or zeroed — without turning this page into the editor.
 */
const PREVIEW_ROWS = 5;

/**
 * How much of the board the preview downloads to fill those rows. The BFF serves skaters by
 * points and goalies by wins; the default weights score hits and blocks too, so the order the
 * preview wants is not exactly the order it receives — these are wide enough that the players it
 * would pick out of the whole pool are certainly inside, and narrow enough to be a few kilobytes
 * rather than the half-megabyte the editor needs.
 */
const PREVIEW_FETCH_LIMITS = { skaters: 25, goalies: 10 };

/** One preview row, in the shapes the editor's own table components expect. */
interface PreviewRow {
  rank: number;
  player: Player;
  projection: Projection;
  score: PlayerScore;
  rookie: boolean;
  belowMinGames: boolean;
}

/** A player with the value the editor's default settings give them. */
interface ScoredPlayer {
  player: Player;
  /** The line it was scored on — the model's when the AI preset is picked, its own otherwise. */
  projection: Projection;
  score: PlayerScore;
  qualified: boolean;
}

const ZERO_SCORE: PlayerScore = { fantasyPoints: 0, zScore: 0 };

/** The row 'From scratch' gives a player: their own seat on the board, with nothing in it. */
function zeroedProjection(player: Player): Projection {
  return player.type === 'skater'
    ? { type: 'skater', playerId: player.id, stats: ZEROED_SKATER_STATS }
    : { type: 'goalie', playerId: player.id, stats: ZEROED_GOALIE_STATS };
}

/** What 'From scratch' gives every player. Read-only rows, so one instance serves them all. */
const ZEROED_SKATER_STATS: SkaterStats = {
  utility: { gp: 0, toiPerGame: 0 },
  scoring: Object.fromEntries(
    SKATER_SCORING_STAT_KEYS.map((key) => [key, 0]),
  ) as SkaterScoringStats,
};

const ZEROED_GOALIE_STATS: GoalieStats = {
  utility: { gp: 0 },
  scoring: Object.fromEntries(
    GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0]),
  ) as GoalieScoringStats,
};

@Component({
  selector: 'app-projection-create',
  imports: [
    LoadingIndicatorComponent,
    ErrorStateComponent,
    HelpTipComponent,
    RouterLink,
    PlayerRowComponent,
    ProjectionsTableHeaderComponent,
  ],
  templateUrl: './projection-create.html',
  styleUrl: './projection-create.css',
})
export class ProjectionCreateComponent {
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly playerService = inject(PlayerService);
  private readonly projectionModel = inject(ProjectionModelService);
  private readonly ranking = inject(ProjectionRankingService);

  // Only the existing projections are needed here: the player rows of a new projection are
  // filled in server-side from `source`, so this page no longer downloads every player just
  // to upload them straight back.
  private readonly dataResource = rxResource({
    stream: () => this.projectionStorage.listProjections(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  /**
   * The preview's own fetch, kept apart from `dataResource`: it is decoration, so a slow or
   * failed player read model must not stop anyone creating a projection. Only the top of the
   * board, since only five rows are drawn — and the goalies come with the skaters because one of
   * those rows is kept for a goalie (see `previewPlayers`).
   */
  private readonly previewPlayersResource = rxResource({
    stream: () => this.playerService.getPlayers(PREVIEW_FETCH_LIMITS),
    defaultValue: [] as Player[],
  });

  /** The rookie markers the editor's rows draw. Null means "couldn't tell", so nothing is marked. */
  private readonly rookieIdsResource = rxResource({
    stream: () => this.playerService.getRookieIds(),
    defaultValue: null as Set<number> | null,
  });

  readonly dataSource = signal<DataSource>('last-season');

  /**
   * The model's lines, fetched only once the AI preset is picked. The endpoint serves the whole
   * board — there is no way to ask for the handful of rows the preview draws — so this is a
   * download the size of the player pool, and it stays lazy to keep the page as fast as it was
   * for everyone who never chooses it.
   */
  private readonly modelSeedResource = rxResource({
    params: () => (this.dataSource() === 'ai' ? {} : undefined),
    stream: () => this.projectionModel.seed(),
    defaultValue: undefined as SeededProjectionResponse | undefined,
  });
  readonly copyFromId = signal<string | null>(null);
  readonly existingProjections = computed(() => this.dataResource.value());
  readonly isLoading = this.dataResource.isLoading;
  readonly loadError = computed(() => !!this.dataResource.error());
  readonly isCreating = signal<boolean>(false);
  readonly name = linkedSignal(() => this.defaultName(this.dataResource.value()));

  /**
   * Exactly the columns a new projection opens with — the goalie ones included, so they read as
   * the editor's empty cells rather than being quietly left out of the preview.
   */
  readonly previewActiveColumns: ActiveColumns = {
    scoring: new Set(DEFAULT_SCORING_COLUMNS),
    utility: new Set(DEFAULT_UTILITY_COLUMNS),
  };
  readonly previewStatWeights = DEFAULT_STAT_WEIGHTS;
  readonly previewDecimalSettings = DEFAULT_DECIMAL_SETTINGS;
  readonly isPreviewLoading = this.previewPlayersResource.isLoading;
  readonly previewFailed = computed(() => !!this.previewPlayersResource.error());

  /**
   * The lines the preview ranks. Every player's own stats, except under the AI preset, where
   * they are the model's estimates instead.
   *
   * <p>The model reaches fewer players than the pool does, and a projection seeded from it holds
   * only the ones it reached — so the rows missing here are exactly the rows the editor will not
   * open with. Ranking the model's own lines rather than filtering last season's also gives the
   * preview the model's order and the model's totals, which is what the finished board shows.
   */
  private readonly previewProjections = computed<Projection[]>(() => {
    const players = this.previewPlayersResource.hasValue()
      ? this.previewPlayersResource.value()
      : [];
    const own = players.map((player) =>
      player.type === 'skater'
        ? { type: 'skater' as const, playerId: player.id, stats: player.stats }
        : { type: 'goalie' as const, playerId: player.id, stats: player.stats },
    );
    if (this.dataSource() !== 'ai') {
      return own;
    }
    const seeded = this.modelSeedResource.value();
    if (!seeded) {
      // Still loading, or the fetch failed. The template says so rather than showing the board
      // this preset would not produce.
      return [];
    }
    // Only the players whose identity this page holds: it fetches the top of the board, not the
    // pool, so a model line for anyone further down has no name to put beside it.
    const inPreviewPool = new Set(players.map((player) => player.id));
    return seeded.players
      .filter((player) => inPreviewPool.has(player.playerId))
      .map((player) => this.serializer.toProjection(player));
  });

  /** Every player, scored and ordered exactly as the editor scores and orders them by default. */
  private readonly rankedPlayers = computed<ScoredPlayer[]>(() => {
    // Via hasValue(): reading a resource that failed throws, and neither fetch is worth taking
    // the page down for.
    const players = this.previewPlayersResource.hasValue()
      ? this.previewPlayersResource.value()
      : [];
    const projections = this.previewProjections();
    if (!players.length || !projections.length) {
      return [];
    }
    const byId = new Map(players.map((player) => [player.id, player]));
    return this.ranking
      .rankOverall({
        projections,
        scoringType: 'points',
        statWeights: DEFAULT_STAT_WEIGHTS,
        activeScoringColumns: new Set(DEFAULT_SCORING_COLUMNS),
        leagueSize: DEFAULT_LEAGUE_SIZE,
        rosterSlots: DEFAULT_ROSTER_SLOTS,
        minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
        decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      })
      .map((scored) => ({
        player: byId.get(scored.projection.playerId),
        projection: scored.projection,
        score: scored.score,
        qualified: scored.qualified,
      }))
      .filter((row): row is ScoredPlayer => !!row.player);
  });

  /**
   * The five rows shown, with the last seat given to a goalie whenever the ranking hasn't put one
   * there itself. The board's own top five is all skaters, which would leave every goalie column
   * showing the dash a skater has and nothing else.
   */
  private readonly previewPlayers = computed<ScoredPlayer[]>(() => {
    const ranked = this.rankedPlayers();
    const shown = ranked.slice(0, PREVIEW_ROWS);
    if (shown.some((row) => row.player.type === 'goalie')) {
      return shown;
    }
    const goalie = ranked.find((row) => row.player.type === 'goalie');
    return goalie ? [...shown.slice(0, PREVIEW_ROWS - 1), goalie] : shown;
  });

  readonly previewRows = computed<PreviewRow[]>(() => {
    // 'From scratch' is the same players in the same rows, just emptied — which is the whole
    // point of showing it: the board doesn't change, only the numbers on it.
    const zeroed = this.dataSource() === 'blank';
    const rookieIds = this.rookieIdsResource.hasValue() ? this.rookieIdsResource.value() : null;
    return this.previewPlayers().map(({ player, projection, score, qualified }, index) => ({
      // Numbered by their place in the preview, the way the editor numbers its own view. The
      // goalie is lifted in from further down the board, and its real place there — three
      // figures, next to a 4 — reads as a fault rather than as information.
      rank: index + 1,
      player,
      projection: zeroed ? zeroedProjection(player) : projection,
      score: zeroed ? ZERO_SCORE : score,
      rookie: rookieIds?.has(player.id) ?? false,
      // The editor marks a goalie projected for fewer games than the league minimum, which is
      // why it ranks last. From scratch nobody is projected for anything yet.
      belowMinGames: !zeroed && player.type === 'goalie' && !qualified,
    }));
  });

  readonly isModelPreviewLoading = computed(
    () => this.dataSource() === 'ai' && this.modelSeedResource.isLoading(),
  );

  /**
   * How much of the board the model reached, so the page can say the projection will be smaller
   * rather than quietly opening with fewer rows than the other presets give.
   */
  readonly modelCoverage = computed(() => {
    const seeded = this.modelSeedResource.value();
    return seeded ? { skaters: seeded.skaters, goalies: seeded.goalies } : null;
  });

  readonly canCreate = computed(
    () =>
      !this.isCreating() &&
      this.name().trim().length > 0 &&
      (this.dataSource() !== 'copy' || !!this.copyFromId()),
  );

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onNameFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  private defaultName(projections: ProjectionSummaryResponse[]): string {
    const takenNames = new Set(projections.map((projection) => projection.name));
    if (!takenNames.has('My Projection')) {
      return 'My Projection';
    }
    let suffix = 2;
    while (takenNames.has(`My Projection ${suffix}`)) {
      suffix++;
    }
    return `My Projection ${suffix}`;
  }

  onCopyFromChange(event: Event): void {
    this.copyFromId.set((event.target as HTMLSelectElement).value || null);
  }

  retryLoad(): void {
    this.dataResource.reload();
    this.previewPlayersResource.reload();
  }

  create(): void {
    if (!this.canCreate()) {
      return;
    }
    this.isCreating.set(true);

    if (this.dataSource() === 'copy') {
      this.projectionStorage
        .loadProjection(this.copyFromId()!)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (projection) => this.persist({ ...projection.data, draft: undefined }),
          error: () => {
            this.isCreating.set(false);
            this.notification.error("Couldn't load the projection to copy. Please try again.");
          },
        });
      return;
    }

    // No player rows: the server derives them from `source`, out of the same read model this
    // page would otherwise have downloaded and sent straight back (~0.5 MB, and the upload
    // that was failing in production).
    this.persist(
      this.serializer.toProjectionData(
        createDefaultProjectionState((key) => this.statInfoService.isRateStat(key)),
      ),
      SOURCE_BY_CHOICE[this.dataSource() as Exclude<DataSource, 'copy'>],
    );
  }

  private persist(data: ProjectionData, source?: CreateProjectionRequest['source']): void {
    this.projectionStorage
      .createProjection({ name: this.name().trim(), data, source })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.analytics.capture('projection_created');
          void this.router.navigate(['/projections', projection.id]);
        },
        error: (error: unknown) => {
          this.isCreating.set(false);
          // Each user may keep only one projection; the server rejects a second with 409.
          if (error instanceof HttpErrorResponse && error.status === 409) {
            void this.router.navigate(['/projections']);
          } else {
            this.notification.error("Couldn't create the projection. Please try again.");
          }
        },
      });
  }
}
