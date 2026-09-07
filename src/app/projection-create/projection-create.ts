import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
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
import { ProjectionResponse } from '../api/models/projection-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionData } from '../api/models/projection-data';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { ShareImportComponent } from '../shared/share-import/share-import';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
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
import { ProjectionState } from '../services/projection-serializer';
import { ProjectionModelService } from '../services/projection-model.service';
import { freeProjectionName } from '../services/projection-name';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';
import { offeredPresets } from '../models/ai-projection';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { isPremiumRefusal, PREMIUM_REFUSED_MESSAGE } from '../shared/premium/premium-refused';
import { SOURCE_KINDS, SourceKind } from '../models/source-kind';
import { environment } from '../../environments/environment';

/**
 * What the projection opens with: a preset everybody has, or a copy of a board the user can
 * already open — one of their own, or one imported from someone's share link.
 *
 * <p>One value, not a group plus a preset plus a copy id. Split in three, two answers were held
 * at once and the visible group decided which of them the Create button used, so a copy picked
 * under one heading was discarded without a word by creating under another.
 */
export type StartingPoint =
  | { readonly kind: 'preset'; readonly source: NonNullable<CreateProjectionRequest['source']> }
  /**
   * A copy of a board. `id` is null only while the copy card is down and there is no board to
   * copy yet: the card is still the answer to "what kind", so it stays picked, but Create waits.
   */
  | { readonly kind: 'copy'; readonly id: string | null };

/** A starting point the server can derive on its own, from nothing the user has to supply. */
export interface CreatePreset {
  readonly name: string;
  readonly source: NonNullable<CreateProjectionRequest['source']>;
  /**
   * Sold as part of Premium. It marks the card and nothing else — `showsPremiumBadge` keeps the
   * mark out of a build that has no way to charge for it.
   */
  readonly premium?: boolean;
}

/** Every preset this page knows of. What it offers is `offeredPresets` of these — see below. */
export const CREATE_PRESETS: readonly CreatePreset[] = [
  { name: "Last season's stats", source: 'default' },
  { name: 'AI projection', source: 'model', premium: true },
  { name: 'From scratch', source: 'blank' },
];

/**
 * How many rows the preview shows. Enough to see what the editor opens as — the columns, the
 * order, whether the numbers are real or zeroed — without turning this page into the editor.
 */
const PREVIEW_ROWS = 5;

/**
 * How much of the board a preset's preview downloads to fill those rows. The BFF serves skaters by
 * points and goalies by wins; the default weights score hits and blocks too, so the order the
 * preview wants is not exactly the order it receives — these are wide enough that the players it
 * would pick out of the whole pool are certainly inside, and narrow enough to be a few kilobytes
 * rather than the half-megabyte the editor needs.
 */
const PREVIEW_FETCH_LIMITS = { skaters: 25, goalies: 10 };

/**
 * What the preview scores and draws with. A preset's is the same for everyone, since a new
 * projection opens on the defaults; a copy's is the copied board's own, since that is what the
 * copy opens with.
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
    ShareImportComponent,
    RelativeTimePipe,
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
  private readonly aiAccess = inject(AiProjectionAccess);
  private readonly ranking = inject(ProjectionRankingService);

  // Only the boards themselves are needed here: the player rows of a new projection are
  // filled in server-side from `source`, so this page no longer downloads every player just
  // to upload them straight back. Both kinds are listed — the user's own projections and the
  // ones they imported from a share link are each a starting point a copy can be made from.
  private readonly dataResource = rxResource({
    stream: () => this.projectionStorage.listEditable(),
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

  /**
   * The board a copy would be made of: its rows and its settings, so the copy is previewed as the
   * editor will open it rather than described in a sentence.
   *
   * <p>Fetched only once a copy is picked, and read again by `create()` — so previewing a board
   * and then creating from it downloads it once, which is what creating from it cost when there
   * was no preview.
   */
  private readonly copiedBoardResource = rxResource({
    params: () => {
      const point = this.startingPoint();
      return point.kind === 'copy' ? (point.id ?? undefined) : undefined;
    },
    stream: ({ params: id }) => this.board(id),
    defaultValue: undefined as ProjectionResponse | undefined,
  });

  /**
   * The whole pool, fetched only once a copy is picked. The preset previews get by on the top of
   * the board, but a copy's five rows are its own top five and can be anyone on it — a player
   * outside that slice would have no name to put beside their numbers.
   */
  private readonly copyPoolResource = rxResource({
    // On a picked board rather than on the copy card, so opening a kind holding nothing to copy
    // does not download the pool to draw nothing with it.
    params: () => (this.previewsCopy() ? {} : undefined),
    stream: () => this.wholePool(),
    defaultValue: [] as Player[],
  });

  /** Boards already downloaded, so picking through them and back costs one fetch each. */
  private readonly boards = new Map<string, ProjectionResponse>();
  private pool: Player[] | null = null;

  /** The rookie markers the editor's rows draw. Null means "couldn't tell", so nothing is marked. */
  private readonly rookieIdsResource = rxResource({
    stream: () => this.playerService.getRookieIds(),
    defaultValue: null as Set<number> | null,
  });

  /**
   * The presets this build offers. Filtered rather than constant: the AI projection is behind a
   * build flag, and a row that seeds a projection the build cannot fill in is worse than no row.
   */
  readonly presets = offeredPresets(CREATE_PRESETS);

  readonly sourceKinds = SOURCE_KINDS;

  /**
   * Which of the three kinds the cards below are showing. Opens on the presets: it is the group
   * that is never empty, and where most projections begin.
   */
  readonly sourceKind = signal<SourceKind>('preset');

  /**
   * The one answer the page holds, and the card that is checked. The first of the open kind is
   * picked as soon as the kind is, so Create is never a press away from nothing; a pick the user
   * made survives the list reloading for as long as its card is still there.
   */
  readonly startingPoint = linkedSignal<
    { kind: SourceKind; options: readonly StartingPoint[] },
    StartingPoint
  >({
    source: () => ({ kind: this.sourceKind(), options: this.optionsOf(this.sourceKind()) }),
    computation: ({ options }, previous) => {
      const kept = previous?.value;
      if (kept && options.some((option) => sameStartingPoint(option, kept))) {
        return kept;
      }
      return options[0] ?? NOTHING_TO_COPY;
    },
  });

  /**
   * The model's lines for the preview, fetched only once the AI preset is picked — and only the
   * top of them, the same slice of the board the pool itself is asked for. The counts come back
   * whole either way, so the note under the table still speaks for the whole league.
   */
  private readonly modelSeedResource = rxResource({
    // Not while it is locked: the BFF refuses the model's lines to an account without premium,
    // so asking would spend a request to draw the page's error state over the pitch that is
    // supposed to be there instead.
    params: () => (this.isModelPreset() && !this.aiProjectionLocked() ? {} : undefined),
    stream: () =>
      this.projectionModel.seed({
        skaterLimit: PREVIEW_FETCH_LIMITS.skaters,
        goalieLimit: PREVIEW_FETCH_LIMITS.goalies,
      }),
    defaultValue: undefined as SeededProjectionResponse | undefined,
  });
  readonly ownProjections = computed(() => this.byKind('projection'));
  readonly importedBoards = computed(() => this.byKind('imported'));
  /** Whether a copy is what is picked, board or not — the preview draws only once one is. */
  readonly isCopy = computed(() => this.startingPoint().kind === 'copy');
  /** Whether a board is picked, which is what the preview downloads and draws. */
  private readonly previewsCopy = computed(() => {
    const point = this.startingPoint();
    return point.kind === 'copy' && point.id !== null;
  });
  /** Whether the AI preset is what the page is showing, which is what its extra fetch follows. */
  private readonly isModelPreset = computed(() => this.isPreset('model'));
  /**
   * The board a copy would be made of, as the list has it, or null when a preset is picked or
   * there is no board to copy yet. Its name is what the preview falls back to when the board
   * itself will not download.
   */
  readonly copiedBoard = computed(() => {
    const point = this.startingPoint();
    if (point.kind !== 'copy' || point.id === null) {
      return null;
    }
    return this.dataResource.value().find((board) => board.id === point.id) ?? null;
  });
  readonly isLoading = this.dataResource.isLoading;
  readonly loadError = computed(() => !!this.dataResource.error());
  readonly isCreating = signal<boolean>(false);
  readonly name = linkedSignal(() =>
    freeProjectionName(this.dataResource.value().map((projection) => projection.name)),
  );

  /**
   * Whether the name is one the user is already keeping something under. The server refuses it
   * either way (names are unique per user across their own boards and imported ones alike), so
   * this is only about where they find out: on the field they can fix, rather than in a toast
   * after pressing Create.
   *
   * <p>Compared exactly, trimmed, because that is the comparison the server makes. Anything
   * looser would stop a name it would have accepted.
   */
  readonly nameTaken = computed(() => {
    const typed = this.name().trim();
    return (
      typed.length > 0 && this.dataResource.value().some((projection) => projection.name === typed)
    );
  });

  /**
   * The picked board as the editor would open it. Null while a preset is picked, and while a
   * board is still on its way.
   */
  private readonly copiedState = computed<ProjectionState | null>(() => {
    const board = this.copiedBoardResource.hasValue()
      ? this.copiedBoardResource.value()
      : undefined;
    return board ? this.serializer.fromProjectionData(board.data) : null;
  });

  /** What the preview scores and draws with: the copied board's settings, or the defaults. */
  private readonly previewSettings = computed<PreviewSettings>(
    () => this.copiedState() ?? DEFAULT_PREVIEW_SETTINGS,
  );

  readonly previewActiveColumns = computed<ActiveColumns>(() => ({
    scoring: this.previewSettings().activeScoringColumns,
    utility: this.previewSettings().activeUtilityColumns,
  }));
  readonly previewScoringType = computed(() => this.previewSettings().scoringType);
  readonly previewStatWeights = computed(() => this.previewSettings().statWeights);
  readonly previewDecimalSettings = computed(() => this.previewSettings().decimalSettings);
  readonly previewUseDefaultDecimals = computed(() => this.previewSettings().useDefaultDecimals);

  /** Whatever the picked starting point has to download before the preview can be drawn. */
  readonly isPreviewLoading = computed(() =>
    this.isCopy()
      ? this.copiedBoardResource.isLoading() || this.copyPoolResource.isLoading()
      : this.previewPlayersResource.isLoading(),
  );

  readonly previewFailed = computed(() =>
    this.isCopy()
      ? !!this.copiedBoardResource.error() || !!this.copyPoolResource.error()
      : !!this.previewPlayersResource.error(),
  );

  /** Who the preview can name: the whole pool for a copy, the top of the board for a preset. */
  private readonly previewPool = computed<Player[]>(() => {
    // Via hasValue(): reading a resource that failed throws, and neither fetch is worth taking
    // the page down for.
    const players = this.isCopy() ? this.copyPoolResource : this.previewPlayersResource;
    return players.hasValue() ? players.value() : [];
  });

  /**
   * The lines the preview ranks. Every player's own stats, except under the AI preset, where
   * they are the model's estimates instead, and under a copy, where they are the board's own.
   *
   * <p>The model reaches fewer players than the pool does, and a projection seeded from it holds
   * only the ones it reached — so the rows missing here are exactly the rows the editor will not
   * open with. Ranking the model's own lines rather than filtering last season's also gives the
   * preview the model's order and the model's totals, which is what the finished board shows.
   */
  private readonly previewProjections = computed<Projection[]>(() => {
    if (this.isCopy()) {
      // The board whole, not the slice of it this page holds names for: ranked whole, its top
      // five are its own top five, and in category scoring the z-scores are the board's too.
      // Nothing at all until the board is here — last season's numbers under a copy card would
      // be a preview of a board nobody picked.
      return this.copiedState()?.playerProjections ?? [];
    }
    const players = this.previewPool();
    const own = players.map((player) =>
      player.type === 'skater'
        ? { type: 'skater' as const, playerId: player.id, stats: player.stats }
        : { type: 'goalie' as const, playerId: player.id, stats: player.stats },
    );
    if (!this.isModelPreset()) {
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
        decimalSettings: settings.decimalSettings,
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

  readonly isModelPreviewLoading = computed(
    () => this.isModelPreset() && this.modelSeedResource.isLoading(),
  );

  /**
   * How much of the board the model reached, so the page can say the projection will be smaller
   * rather than quietly opening with fewer rows than the other presets give.
   */
  readonly modelCoverage = computed(() => {
    const seeded = this.modelSeedResource.value();
    return seeded ? { skaters: seeded.skaters, goalies: seeded.goalies } : null;
  });

  /** Whether the answer names something to start from: a preset always does, a copy needs a board. */
  private readonly hasStartingPoint = computed(() => {
    const point = this.startingPoint();
    return point.kind === 'preset' || point.id !== null;
  });

  readonly canCreate = computed(
    () =>
      !this.isCreating() &&
      this.name().trim().length > 0 &&
      !this.nameTaken() &&
      this.hasStartingPoint() &&
      // A locked starting point can be picked and read about, but not created from: the button
      // becomes the way to Premium instead, and this keeps the two from disagreeing.
      !this.aiProjectionLocked(),
  );

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onNameFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  selectPreset(source: CreatePreset['source']): void {
    this.startingPoint.set({ kind: 'preset', source });
  }

  selectCopyFrom(id: string): void {
    this.startingPoint.set({ kind: 'copy', id });
  }

  /**
   * How many starting points a kind holds, shown on its segment so the two kinds not open are
   * still accounted for. The presets are always there, so only the other two can read 0.
   */
  kindCount(kind: SourceKind): number {
    return this.optionsOf(kind).length;
  }

  /**
   * Whether to mark a preset as Premium. Only where payments exist, for the reason the draft
   * picker gives (draft-start.ts): without them the AI projection is free and ungated, and a
   * badge naming a subscription the build cannot sell promises something nobody can act on.
   */
  showsPremiumBadge(preset: CreatePreset): boolean {
    return !!preset.premium && environment.paymentsEnabled;
  }

  /**
   * Whether this account would have to subscribe before it could start from a preset. The card
   * stays pickable: picking it is how someone reads what the AI projection is, and the preview
   * slot becomes the pitch rather than a table.
   */
  isPresetLocked(preset: CreatePreset): boolean {
    return !!preset.premium && this.aiAccess.locked();
  }

  /** Whether the starting point picked right now is the one behind the subscription. */
  readonly aiProjectionLocked = computed(() => this.isModelPreset() && this.aiAccess.locked());

  isPreset(source: CreatePreset['source']): boolean {
    const point = this.startingPoint();
    return point.kind === 'preset' && point.source === source;
  }

  isCopyOf(id: string): boolean {
    const point = this.startingPoint();
    return point.kind === 'copy' && point.id === id;
  }

  /** Whose numbers a row holds, said in the row rather than only by the heading above it. */
  sourceLabel(projection: ProjectionSummaryResponse): string {
    return projection.origin ? `From ${projection.origin.authorUsername}` : 'Your projection';
  }

  /**
   * A board just copied from a share link is a starting point, so it arrives already picked —
   * checked before the list that will hold it has been re-read, since `startingPoint` keeps a
   * pick whose card turns up in the reload.
   */
  onImported(projection: ProjectionResponse): void {
    this.sourceKind.set('imported');
    this.selectCopyFrom(projection.id);
    this.dataResource.reload();
  }

  /** Every starting point of one kind, in the order its cards are drawn. */
  private optionsOf(kind: SourceKind): readonly StartingPoint[] {
    switch (kind) {
      case 'preset':
        return this.presets.map((preset) => ({ kind: 'preset', source: preset.source }) as const);
      case 'projection':
        return this.ownProjections().map(
          (projection) =>
            ({
              kind: 'copy',
              id: projection.id,
            }) as const,
        );
      case 'imported':
        return this.importedBoards().map((board) => ({ kind: 'copy', id: board.id }) as const);
    }
  }

  private byKind(kind: ProjectionSummaryResponse['kind']): ProjectionSummaryResponse[] {
    return this.dataResource
      .value()
      .filter((projection) => projection.kind === kind)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }

  retryLoad(): void {
    this.dataResource.reload();
    this.previewPlayersResource.reload();
    this.copyPoolResource.reload();
  }

  /**
   * One board, downloaded once. Both the preview and Create read it here, so picking a board and
   * then creating from it costs the one fetch rather than the same half-megabyte twice.
   */
  private board(id: string): Observable<ProjectionResponse> {
    const held = this.boards.get(id);
    return held
      ? of(held)
      : this.projectionStorage
          .loadProjection(id)
          .pipe(tap((loaded) => this.boards.set(id, loaded)));
  }

  /** The pool, downloaded once, however often the picked kind leaves the copies and comes back. */
  private wholePool(): Observable<Player[]> {
    const held = this.pool;
    return held
      ? of(held)
      : this.playerService.getPlayers().pipe(tap((players) => (this.pool = players)));
  }

  create(): void {
    if (!this.canCreate()) {
      return;
    }
    this.isCreating.set(true);

    const point = this.startingPoint();
    if (point.kind === 'copy') {
      if (point.id === null) {
        // Unreachable through the button, which `canCreate` holds back; said for the type.
        this.isCreating.set(false);
        return;
      }
      this.board(point.id)
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
      point.source,
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
          // Names are unique per user, and the name is right there to change — so a 409 is
          // something to say on the page rather than a reason to navigate away from it.
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.notification.error('You already have a projection with that name.');
          } else if (isPremiumRefusal(error)) {
            // Held back by `canCreate`, so this is the two disagreeing: a subscription that
            // lapsed while the page was open, or an entitlement read that never landed.
            this.notification.error(PREMIUM_REFUSED_MESSAGE);
          } else {
            this.notification.error("Couldn't create the projection. Please try again.");
          }
        },
      });
  }
}

/**
 * What the picked card falls back to when the open kind holds nothing to copy. The kind is still
 * the answer to "what does this start from", so it stays open; only Create waits, held back by
 * `hasStartingPoint`.
 */
const NOTHING_TO_COPY: StartingPoint = { kind: 'copy', id: null };

function sameStartingPoint(first: StartingPoint, second: StartingPoint): boolean {
  if (first.kind === 'preset' && second.kind === 'preset') {
    return first.source === second.source;
  }
  return first.kind === 'copy' && second.kind === 'copy' && first.id === second.id;
}
