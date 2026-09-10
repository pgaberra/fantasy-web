import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, of, tap } from 'rxjs';
import { PlayerService } from '../../services/player.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import { ProjectionModelService } from '../../services/projection-model.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { ProjectionBoardCache } from '../../services/projection-board-cache';
import { ProjectionState } from '../../services/projection-serializer';
import { Player } from '../../models/player.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';
import {
  ActiveColumns,
  GoalieScoringStats,
  GoalieStats,
  PlayerScore,
  Projection,
  SkaterScoringStats,
  SkaterStats,
} from '../../models/projection.model';
import { PlayerRowComponent } from '../../draft-projection/player-projections-table/player-row/player-row';
import { ProjectionsTableHeaderComponent } from '../../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { TableScrollDirective } from '../table-scroll/table-scroll.directive';
import { ProjectionResponse } from '../../api/models/projection-response';
import { CreateProjectionRequest } from '../../api/models/create-projection-request';
import { SeededProjectionResponse } from '../../api/models/seeded-projection-response';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../../draft-projection/projection-settings-section/model';
import { readableDecimalSettings } from '../../draft-projection/projection-settings-section/model-decimals';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';
import { ownLine, squaredWithPool } from '../pool-line';

/** A starting point the server derives on its own, from nothing the user has to supply. */
export type PresetSource = NonNullable<CreateProjectionRequest['source']>;

/**
 * What is being previewed: one of the presets, or a board the user can already open — one of
 * their own, or one imported from a share link.
 */
export type PreviewSource =
  | { readonly kind: 'preset'; readonly preset: PresetSource }
  | { readonly kind: 'board'; readonly id: string };

/**
 * How many rows the preview shows. Enough to see what the editor opens as — the columns, the
 * order, whether the numbers are real or zeroed — without turning the page into the editor.
 */
const PREVIEW_ROWS = 5;

/**
 * How much of the board a preset's preview downloads to fill those rows. The BFF serves skaters by
 * points and goalies by wins; the default weights score hits and blocks too, so the order the
 * preview wants is not exactly the order it receives — these are wide enough that the players it
 * would pick out of the whole pool are certainly inside, and narrow enough to be a few kilobytes
 * rather than the half-megabyte the editor needs.
 *
 * <p>They are also the width the BFF serves without a subscription, so the AI preset previews
 * for everyone. Widen either one and a free account gets a 403 instead of a preview.
 */
const PREVIEW_FETCH_LIMITS = { skaters: 25, goalies: 10 };

/**
 * What the preview scores and draws with. A preset's is the same for everyone, since a new
 * projection opens on the defaults; a board's is its own, since that is what it opens with.
 */
type PreviewSettings = Pick<
  ProjectionState,
  | 'scoringType'
  | 'statWeights'
  | 'activeScoringColumns'
  | 'activeUtilityColumns'
  | 'decimalSettings'
  | 'useDefaultDecimals'
  | 'leagueSize'
  | 'rosterSlots'
  | 'minGoalieGames'
>;

/** Exactly what a projection created from a preset opens with. */
const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  scoringType: 'points',
  statWeights: DEFAULT_STAT_WEIGHTS,
  // The goalie columns included, so they read as the editor's empty cells rather than being
  // quietly left out of the preview.
  activeScoringColumns: new Set(DEFAULT_SCORING_COLUMNS),
  activeUtilityColumns: new Set(DEFAULT_UTILITY_COLUMNS),
  decimalSettings: DEFAULT_DECIMAL_SETTINGS,
  useDefaultDecimals: true,
  leagueSize: DEFAULT_LEAGUE_SIZE,
  rosterSlots: DEFAULT_ROSTER_SLOTS,
  minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
};

/** One preview row, in the shapes the editor's own table components expect. */
interface PreviewRow {
  rank: number;
  player: Player;
  projection: Projection;
  score: PlayerScore;
  rookie: boolean;
  belowMinGames: boolean;
}

/** A player with the value the preview's settings give them. */
interface ScoredPlayer {
  player: Player;
  /** The line it was scored on — the model's under the AI preset, its own otherwise. */
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

/**
 * The top of whatever board a starting point would open: the editor's own header and rows,
 * read-only. Shown by the pages that ask someone to pick a starting point — the new-projection
 * page and the draft picker — so the pick is made against the board itself rather than its name.
 *
 * <p>Every fetch here is decoration: a slow or failed read model must not stop the page it sits
 * on, so nothing it does is on the way of the button below it.
 *
 * <p>Needs a {@link ProjectionBoardCache} from the page that hosts it. Sharing the page's cache
 * is what keeps previewing a board and then acting on it to one download.
 */
@Component({
  selector: 'app-starting-point-preview',
  imports: [
    PlayerRowComponent,
    ProjectionsTableHeaderComponent,
    TableScrollDirective,
    LoadingIndicatorComponent,
  ],
  templateUrl: './starting-point-preview.html',
  styleUrl: './starting-point-preview.css',
})
export class StartingPointPreviewComponent {
  private readonly playerService = inject(PlayerService);
  private readonly projectionModel = inject(ProjectionModelService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly boardCache = inject(ProjectionBoardCache);

  /** What to draw. Null while the page has nothing picked, which draws the note and no table. */
  readonly source = input.required<PreviewSource | null>();

  /**
   * What to say instead of the table when there is nothing to draw. The pages know which pick
   * failed and what it would have meant, so the sentence is theirs; without one the preview
   * falls back to saying only that it is unavailable.
   */
  readonly fallbackNote = input<string | null>(null);

  /** Whether a board is what is picked, which is what the preview downloads a whole pool for. */
  private readonly isBoard = computed(() => this.source()?.kind === 'board');

  /** Whether the AI preset is picked, which is what the model fetch and the note follow. */
  readonly isModelPreset = computed(() => this.isPreset('model'));

  /**
   * The top of the pool, for a preset's preview. Only the top, since only five rows are drawn —
   * and the goalies come with the skaters because one of those rows can be a goalie.
   */
  private readonly topOfPoolResource = rxResource({
    stream: () => this.playerService.getPlayers(PREVIEW_FETCH_LIMITS),
    defaultValue: [] as Player[],
  });

  /**
   * The picked board: its rows and its settings, so it is previewed as the editor will open it
   * rather than described in a sentence.
   */
  private readonly boardResource = rxResource({
    params: () => {
      const source = this.source();
      return source?.kind === 'board' ? source.id : undefined;
    },
    stream: ({ params: id }) => this.boardCache.load(id),
    defaultValue: undefined as ProjectionResponse | undefined,
  });

  /**
   * The whole pool, fetched only once a board is picked. The preset previews get by on the top of
   * the board, but a board's five rows are its own top five and can be anyone on it — a player
   * outside that slice would have no name to put beside their numbers.
   */
  private readonly boardPoolResource = rxResource({
    params: () => (this.isBoard() ? {} : undefined),
    stream: () => this.wholePool(),
    defaultValue: [] as Player[],
  });

  private pool: Player[] | null = null;

  /** The rookie markers the editor's rows draw. Null means "couldn't tell", so nothing is marked. */
  private readonly rookieIdsResource = rxResource({
    stream: () => this.playerService.getRookieIds(),
    defaultValue: null as Set<number> | null,
  });

  /**
   * The model's lines, fetched only once the AI preset is picked — and only the top of them, the
   * same slice of the board the pool itself is asked for.
   *
   * <p>{@link PREVIEW_FETCH_LIMITS} is also what makes this free: the BFF serves a request this
   * narrow to an account without premium, so widening it here would take the preview away from
   * everyone who has not paid.
   */
  private readonly modelSeedResource = rxResource({
    params: () => (this.isModelPreset() ? {} : undefined),
    stream: () =>
      this.projectionModel.seed({
        skaterLimit: PREVIEW_FETCH_LIMITS.skaters,
        goalieLimit: PREVIEW_FETCH_LIMITS.goalies,
      }),
    defaultValue: undefined as SeededProjectionResponse | undefined,
  });

  /** The picked board as the editor would open it. Null while a preset is picked, or on its way. */
  private readonly boardState = computed<ProjectionState | null>(() => {
    const board = this.boardResource.hasValue() ? this.boardResource.value() : undefined;
    return board ? this.serializer.fromProjectionData(board.data) : null;
  });

  /** What the preview scores and draws with: the picked board's settings, or the defaults. */
  private readonly previewSettings = computed<PreviewSettings>(
    () => this.boardState() ?? DEFAULT_PREVIEW_SETTINGS,
  );

  readonly previewActiveColumns = computed<ActiveColumns>(() => ({
    scoring: this.previewSettings().activeScoringColumns,
    utility: this.previewSettings().activeUtilityColumns,
  }));
  readonly previewScoringType = computed(() => this.previewSettings().scoringType);
  readonly previewStatWeights = computed(() => this.previewSettings().statWeights);
  /**
   * The model's lines are fractional, and at the defaults every one of them would be printed as
   * a whole number — the preview of the AI projection would look exactly like the preview of last
   * season's stats. The rows decide, so a preset of whole numbers is untouched.
   */
  readonly previewDecimalSettings = computed(() =>
    readableDecimalSettings(
      this.previewProjections(),
      this.previewSettings().decimalSettings,
      this.previewSettings().useDefaultDecimals,
    ),
  );
  readonly previewUseDefaultDecimals = computed(() => this.previewSettings().useDefaultDecimals);

  /** Whatever the picked starting point has to download before the preview can be drawn. */
  readonly isLoading = computed(
    () =>
      (this.isBoard()
        ? this.boardResource.isLoading() || this.boardPoolResource.isLoading()
        : this.topOfPoolResource.isLoading()) ||
      (this.isModelPreset() && this.modelSeedResource.isLoading()),
  );

  readonly hasFailed = computed(() =>
    this.isBoard()
      ? !!this.boardResource.error() || !!this.boardPoolResource.error()
      : !!this.topOfPoolResource.error(),
  );

  /** Who the preview can name: the whole pool for a board, the top of it for a preset. */
  private readonly previewPool = computed<Player[]>(() => {
    // Via hasValue(): reading a resource that failed throws, and neither fetch is worth taking
    // the page down for.
    const players = this.isBoard() ? this.boardPoolResource : this.topOfPoolResource;
    return players.hasValue() ? players.value() : [];
  });

  /**
   * The lines the preview ranks. Every player's own stats, except under the AI preset, where
   * they are the model's estimates instead, and under a board, where they are the board's own.
   *
   * <p>The model reaches fewer players than the pool does, and a projection seeded from it holds
   * only the ones it reached — so the rows missing here are exactly the rows the editor will not
   * open with. Ranking the model's own lines rather than filtering last season's also gives the
   * preview the model's order and the model's totals, which is what the finished board shows.
   */
  private readonly previewProjections = computed<Projection[]>(() => {
    if (!this.source()) {
      // Nothing picked. Last season's numbers under a card nobody chose would be a preview of a
      // board that is not on offer.
      return [];
    }
    const players = this.previewPool();
    // Squared with the pool the rows are drawn from, as the editor squares them when it opens, so
    // a line of the other kind of player is neither ranked nor drawn.
    const byId = new Map(players.map((player) => [player.id, player]));
    if (this.isBoard()) {
      // The board whole, not the slice of it this page holds names for: ranked whole, its top
      // five are its own top five, and in category scoring the z-scores are the board's too.
      return (this.boardState()?.playerProjections ?? []).map((projection) =>
        squaredWithPool(projection, byId.get(projection.playerId)),
      );
    }
    if (!this.isModelPreset()) {
      return players.map((player) => ownLine(player));
    }
    const seeded = this.modelSeedResource.value();
    if (!seeded) {
      // Still loading, or the fetch failed. The template says so rather than showing the board
      // this preset would not produce.
      return [];
    }
    // Only the players whose identity this page holds: it fetches the top of the board, not the
    // pool, so a model line for anyone further down has no name to put beside it.
    return seeded.players
      .filter((player) => byId.has(player.playerId))
      .map((player) =>
        squaredWithPool(this.serializer.toProjection(player), byId.get(player.playerId)),
      );
  });

  /** Every player, scored and ordered exactly as the editor scores and orders them. */
  private readonly rankedPlayers = computed<ScoredPlayer[]>(() => {
    const players = this.previewPool();
    const projections = this.previewProjections();
    if (!players.length || !projections.length) {
      return [];
    }
    const settings = this.previewSettings();
    const byId = new Map(players.map((player) => [player.id, player]));
    return this.ranking
      .rankOverall({
        projections,
        scoringType: settings.scoringType,
        statWeights: settings.statWeights,
        activeScoringColumns: settings.activeScoringColumns,
        leagueSize: settings.leagueSize,
        rosterSlots: settings.rosterSlots,
        minGoalieGames: settings.minGoalieGames,
        // What the rows are printed with, so the total column adds up to the numbers beside it.
        decimalSettings: this.previewDecimalSettings(),
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
   * The rows shown: the top of the board as the ranking leaves it. A goalie used to be lifted
   * into the last seat whenever the ranking hadn't put one there, so the goalie columns had
   * something in them — but that row was never the board's fifth-best player, and under the AI
   * preset there is not always a goalie to lift. The preview shows the top five, whoever they are.
   */
  private readonly previewPlayers = computed<ScoredPlayer[]>(() =>
    this.rankedPlayers().slice(0, PREVIEW_ROWS),
  );

  readonly previewRows = computed<PreviewRow[]>(() => {
    // 'From scratch' is the same players in the same rows, just emptied — which is the whole
    // point of showing it: the board doesn't change, only the numbers on it.
    const zeroed = this.isPreset('blank');
    const rookieIds = this.rookieIdsResource.hasValue() ? this.rookieIdsResource.value() : null;
    return this.previewPlayers().map(({ player, projection, score, qualified }, index) => ({
      // Numbered by their place in the preview, which is also their place on the board.
      rank: index + 1,
      player,
      projection: zeroed ? zeroedProjection(player) : projection,
      score: zeroed ? ZERO_SCORE : score,
      rookie: rookieIds?.has(player.id) ?? false,
      // The editor marks a goalie projected for fewer games than the league minimum, which is
      // why it ranks last — a category-league rule, so `qualified` only says no on a board
      // scored that way. From scratch nobody is projected for anything yet.
      belowMinGames: !zeroed && player.type === 'goalie' && !qualified,
    }));
  });

  /** Whether the picked starting point is this preset. */
  isPreset(preset: PresetSource): boolean {
    const source = this.source();
    return source?.kind === 'preset' && source.preset === preset;
  }

  /** Fetch again after a failure the page offered to retry. */
  reload(): void {
    this.topOfPoolResource.reload();
    this.boardPoolResource.reload();
  }

  /** The pool, downloaded once, however often the picked kind leaves the boards and comes back. */
  private wholePool(): Observable<Player[]> {
    const held = this.pool;
    return held
      ? of(held)
      : this.playerService.getPlayers().pipe(tap((players) => (this.pool = players)));
  }
}
