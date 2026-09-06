import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  model,
  OnInit,
  output,
  Signal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { PlayerInjury } from '../../api/models/player-injury';
import { Player } from '../../models/player.model';
import { PositionOverrides } from '../../models/position-override';
import { SkaterPosition } from '../../models/position.model';
import { PlayerService } from '../../services/player.service';
import {
  ActiveColumns,
  GoalieScoringStats,
  PositionFilter,
  Projection,
  ScoredProjection,
  ScoringType,
  SkaterScoringStats,
  SortColumn,
  SortDirection,
} from '../../models/projection.model';
import { compareStatValues, defaultSortDirection, statValueOf } from '../../models/sorting';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { ProjectionUpdateService } from '../../services/projection-update.service';
import { ToiService } from '../../services/toi.service';
import { PositionFilterService } from '../../services/position-filter.service';
import { ActiveColumnsService } from '../../services/active-columns.service';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from '../projection-settings-section/model';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../projection-defaults';
import { RosterSlots } from '../../api/models/roster-slots';
import { ProjectionsTableHeaderComponent } from './projections-table-header/projections-table-header';
import { PlayerRowComponent } from './player-row/player-row';
import { PositionFilterComponent } from './position-filter/position-filter';
import { TeamFilterComponent } from './team-filter/team-filter';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  StatKey,
  UtilityStatKey,
} from '../../models/stat-key.model';
import { StatInfoService } from '../../services/stat-info.service';
import { PopoverTriggerDirective } from '../../shared/popover/popover-trigger.directive';
import { parseDecimalInput } from '../../shared/decimal-input';
import { PinnedTableHeaderDirective } from '../../shared/pinned-table-header/pinned-table-header.directive';
import { LeagueSettingsMenuComponent } from './league-settings-menu/league-settings-menu';
import { ColumnsMenuComponent } from './columns-menu/columns-menu';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';

const PLAYERS_PER_PAGE = 250;

/**
 * How recently the player pool must have synced for its team labels to be worth checking a team
 * total against. The Yahoo sync runs daily when it runs at all, so a week's slack survives an
 * outage while ruling out the months-long pause between seasons.
 */
const POOL_FRESH_FOR_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** How long a queued column change waits for a frame that may never come — see queueColumnToggle. */
const COLUMN_APPLY_TIMEOUT_MS = 250;

/** Everything one undo step restores: the projected stats and which columns were on screen. */
interface TableSnapshot {
  playerProjections: Projection[];
  activeScoringColumns: Set<ScoringStatKey>;
  activeUtilityColumns: Set<UtilityStatKey>;
}

function toggledSet<T>(members: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(members);
  if (!next.delete(member)) {
    next.add(member);
  }
  return next;
}

@Component({
  selector: 'app-player-projections-table',
  imports: [
    ProjectionsTableHeaderComponent,
    PlayerRowComponent,
    PositionFilterComponent,
    TeamFilterComponent,
    PopoverTriggerDirective,
    PinnedTableHeaderDirective,
    LeagueSettingsMenuComponent,
    ColumnsMenuComponent,
    TooltipDirective,
  ],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
  host: {
    '(document:keydown)': 'onHistoryKeydown($event)',
  },
})
export class PlayerProjectionsTableComponent implements OnInit {
  // The settings that used to sit in a separate panel are two-way here, so the projection page
  // can hand ownership to the table without giving up the state it autosaves.
  readonly scoringType = model.required<ScoringType>();
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly players = input.required<Player[]>();
  readonly initialProjections = input<Projection[] | null>(null);
  readonly leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = model<number>(DEFAULT_MIN_GOALIE_GAMES);
  readonly saveStatus = input<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /**
   * When the player pool the rows were squared with last synced. Only used to decide whether
   * its team labels are current enough to check a team's goalie starts against.
   */
  readonly playerPoolSyncedAt = input<string | null>(null);
  /**
   * A hard cap on how many rows are ever rendered, for surfaces that show a taste of the list
   * rather than the list. When set, paging is off entirely: `Show more` never appears, because
   * on the landing demo the rest of the list is what an account is for.
   */
  readonly maxVisiblePlayers = input<number | null>(null);
  readonly showFullSeasonButton = input<boolean>(false);
  readonly fullSeasonRequested = output<void>();

  /** Turns on the column menus, the add-column cell and the league toolbar. */
  readonly columnControls = input<boolean>(false);

  /**
   * Turns on correcting a player's positions. Separate from `columnControls` because it needs
   * somewhere to save to: the landing demo has the toolbar but no projection behind it.
   */
  readonly positionControls = input<boolean>(false);
  /** The corrections already made, so a row can show it carries one and the toolbar can count. */
  readonly positionOverrides = input<PositionOverrides>(new Map());
  readonly positionsChanged = output<{ playerId: number; positions: SkaterPosition[] | null }>();
  readonly positionsReset = output<void>();

  readonly overriddenPositionCount = computed(() => this.positionOverrides().size);
  /**
   * The league these settings were imported from, once there is one. Connecting a league is a
   * call to action while it hasn't happened; afterwards it is provenance, so it moves off the
   * toolbar and into the league menu rather than holding a button of its own forever.
   */
  readonly syncedLeagueName = input<string | null>(null);

  /**
   * The League setup menu holds the category ranking inputs and, once a league has been imported,
   * where it came from. A points league that has imported nothing leaves it empty — its scoring is
   * the weight row in the table header — so the button is not offered at all.
   */
  readonly hasLeagueSetup = computed(
    () => this.scoringType() === 'category' || !!this.syncedLeagueName(),
  );
  readonly manageSyncRequested = output<void>();

  /**
   * Which stats the projection scores, and which utility columns sit beside them. These two are
   * the table's only account of its columns — it used to take an `activeColumns` input carrying
   * the same two sets, and a surface that bound one and not the other got a table that rendered
   * columns its own menus could not change.
   */
  readonly activeScoringColumns = model<Set<ScoringStatKey>>(new Set<ScoringStatKey>());
  readonly activeUtilityColumns = model<Set<UtilityStatKey>>(new Set<UtilityStatKey>());

  // What the column menus draw. Ticking a stat re-scores the whole player pool and rebuilds every
  // row underneath, which is a few hundred milliseconds of work that Angular would otherwise do
  // before the browser gets to paint the tick — so the checkbox sits still under the cursor and
  // the click reads as ignored. These run ahead of the real columns instead: the menu redraws from
  // them at once and the table catches up on the next frame. They are linked signals, so anything
  // that changes the columns from elsewhere — an undo, a league sync, opening another projection —
  // resets them without either side having to know about it.
  readonly shownScoringColumns = linkedSignal(() => this.activeScoringColumns());
  readonly shownUtilityColumns = linkedSignal(() => this.activeUtilityColumns());
  private queuedColumnToggles: (() => void)[] = [];
  private pendingFlushTimers: ReturnType<typeof setTimeout>[] = [];

  readonly filteredActiveColumns = computed<ActiveColumns>(() =>
    this.activeColumnsService.filterAndSortActiveColumns(
      { scoring: this.activeScoringColumns(), utility: this.activeUtilityColumns() },
      this.positionFilter(),
    ),
  );
  readonly scaleSettings = model.required<Record<UtilityStatKey, ScaleConfig>>();
  readonly decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = model.required<boolean>();

  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');

  readonly playerProjections = signal<Projection[]>([]);

  /** Rows a stored projection carried for players the league no longer has. Told, never assumed. */
  readonly droppedPlayerCount = signal(0);

  // Undo/redo history for stat edits and column changes. Snapshots are pushed onto `undoStack`
  // before each mutation; consecutive edits to the same cell (same `lastEditSignature`) coalesce
  // into a single step so typing "25" is one undo, not two. Since `ProjectionUpdateService` only
  // clones the changed player, each snapshot is a cheap array of mostly-shared references.
  //
  // Columns belong in the same history as the stat edits: removing one is a single click in a
  // menu, and it is only a cheap click if Ctrl+Z brings it straight back.
  private static readonly MAX_HISTORY = 50;
  private readonly undoStack = signal<TableSnapshot[]>([]);
  private readonly redoStack = signal<TableSnapshot[]>([]);
  private lastEditSignature: string | null = null;
  private fullSeasonEditCounter = 0;
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  private readonly realTimeSortedProjections = computed((): ScoredProjection[] => {
    const scored = this.scoredProjections();
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    const summaryValueOf = this.summaryValueResolver();
    const tieBreak = (a: ScoredProjection, b: ScoredProjection): number =>
      summaryValueOf(b) - summaryValueOf(a);

    if (column === 'name') {
      const players = this.playerMap();
      const nameOf = (scoredProjection: ScoredProjection): string =>
        players.get(scoredProjection.projection.playerId)?.name ?? '';
      return [...scored].sort((a, b) => {
        const primary = sign * nameOf(a).localeCompare(nameOf(b));
        return primary !== 0 ? primary : tieBreak(a, b);
      });
    }

    const valueOf = this.sortValueResolver(column);
    const demoteUnqualified = column === 'summary';
    return [...scored].sort((a, b) => {
      if (demoteUnqualified && a.qualified !== b.qualified) {
        return a.qualified ? -1 : 1;
      }
      const primary = compareStatValues(valueOf(a), valueOf(b), sign);
      // Ties fall back to fantasy value (desc) so equal-stat players stay meaningfully ordered.
      return primary !== 0 ? primary : tieBreak(a, b);
    });
  });

  private sortValueResolver(
    column: Exclude<SortColumn, 'name'>,
  ): (scoredProjection: ScoredProjection) => number | null {
    if (column === 'summary') {
      return this.summaryValueResolver();
    }
    return (scoredProjection) => statValueOf(scoredProjection.projection, column);
  }

  /** Every player has a summary value, so this one never resolves to null. */
  private summaryValueResolver(): (scoredProjection: ScoredProjection) => number {
    return this.scoringType() === 'points'
      ? (scoredProjection) => scoredProjection.score.fantasyPoints
      : (scoredProjection) => scoredProjection.score.zScore;
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(defaultSortDirection(column));
    }
  }
  readonly filteredAndSortedProjections: Signal<ScoredProjection[]> = computed(() => {
    const scored = this.realTimeSortedProjections();
    const filter = this.positionFilter();
    const players = this.playerMap();
    // Holding a row and being able to draw it are different things: a row whose player is not in
    // the pool has no name, team or headshot to render, and reading them threw. Skipping it here
    // rather than discarding it at load keeps the data intact while never rendering a blank.
    const byPosition = scored.filter(
      (sp) =>
        players.has(sp.projection.playerId) &&
        this.positionFilterService.matches(sp.projection, players, filter),
    );
    return this.filterByRookie(this.filterByTeam(byPosition));
  });
  filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit: Signal<ScoredProjection[]> =
    computed(() => {
      if (!this.editingPlayerId()) {
        return this.filteredAndSortedProjections();
      }

      const scored = this.scoredProjections();
      const filter = this.positionFilter();
      const players = this.playerMap();
      const lockedProjections = this.lockedOrder().map((playerId) =>
        scored.find((sp) => sp.projection.playerId === playerId)!,
      );
      const byPosition = lockedProjections.filter((sp) =>
        this.positionFilterService.matches(sp.projection, players, filter),
      );
      return this.filterByRookie(this.filterByTeam(byPosition));
    });

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly projectionUpdateService = inject(ProjectionUpdateService);
  private readonly toiService = inject(ToiService);
  private readonly playerService = inject(PlayerService);
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly activeColumnsService = inject(ActiveColumnsService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The rows as they are scored: every stat at the precision its column shows, so the ranking
   * agrees with the numbers on screen. It depends on the projections and the decimal settings
   * and on nothing else, which is why it is computed apart from the scoring — picking a column
   * re-scores the pool, and re-rounding it at the same time would be a second walk over every
   * player for a set of numbers that cannot have changed.
   */
  private readonly roundedProjections = computed((): Projection[] =>
    this.playerProjections().map((pp) => {
      if (pp.type === 'skater') {
        const roundedScoring: SkaterScoringStats = { ...pp.stats.scoring };
        SKATER_SCORING_STAT_KEYS.forEach((key) => {
          roundedScoring[key] = this.roundStat(roundedScoring[key], key);
        });
        return { ...pp, stats: { ...pp.stats, scoring: roundedScoring } };
      }
      const roundedScoring: GoalieScoringStats = { ...pp.stats.scoring };
      GOALIE_SCORING_STAT_KEYS.forEach((key) => {
        roundedScoring[key] = this.roundStat(roundedScoring[key], key);
      });
      return { ...pp, stats: { ...pp.stats, scoring: roundedScoring } };
    }),
  );

  readonly scoredProjections = computed((): ScoredProjection[] => {
    const projections = this.playerProjections();
    const statWeights = this.statWeights();
    const activeScoringColumns = this.activeScoringColumns();
    const roundedProjections = this.roundedProjections();

    const fantasyPoints = roundedProjections.map((pp) =>
      pp.type === 'skater'
        ? this.projectionCalculationService.computeSkaterTotalPoints(
            pp.stats.scoring,
            statWeights,
            activeScoringColumns,
          )
        : this.projectionCalculationService.computeGoalieTotalPoints(
            pp.stats.scoring,
            statWeights,
            activeScoringColumns,
          ),
    );

    const roster = this.rosterSlots();
    const teams = this.leagueSize();
    const skaterPoolSize =
      teams * (roster.c + roster.lw + roster.rw + roster.d + roster.util + roster.bn);
    const goaliePoolSize = teams * roster.g;
    const zScores = this.projectionCalculationService.computeZScores(
      roundedProjections,
      activeScoringColumns,
      skaterPoolSize,
      goaliePoolSize,
    );

    const isCategory = this.scoringType() === 'category';
    const minGames = this.minGoalieGames();

    return projections.map((projection, i) => ({
      projection,
      score: { fantasyPoints: fantasyPoints[i], zScore: zScores[i] },
      qualified: this.isQualified(projection, isCategory, minGames),
    }));
  });

  private isQualified(projection: Projection, isCategory: boolean, minGames: number): boolean {
    if (!isCategory || projection.type !== 'goalie') {
      return true;
    }
    return projection.stats.utility.gp >= minGames;
  }

  private readonly positionFilterState = signal<PositionFilter>('ALL');
  readonly positionFilter: Signal<PositionFilter> = this.positionFilterState.asReadonly();

  /**
   * Narrowing to a position can take the sorted column off the screen with it: a board of left
   * wings has no goalie columns to sort by. Rather than leave the rows in an order nothing on
   * screen explains, the sort falls back to the ranking.
   */
  setPositionFilter(filter: PositionFilter): void {
    this.positionFilterState.set(filter);
    if (
      this.activeColumnsService.showsSortColumn(
        this.sortColumn(),
        { scoring: this.activeScoringColumns(), utility: this.activeUtilityColumns() },
        filter,
      )
    ) {
      return;
    }
    this.sortColumn.set('summary');
    this.sortDirection.set(defaultSortDirection('summary'));
  }

  /**
   * Ids of this season's rookies, or null while unknown — either still loading or the server
   * declining to say, which it does in any environment without the projection service. Both
   * read the same way here: no marker and no filter, rather than every player a veteran.
   */
  private readonly rookieResource = rxResource({
    stream: () => this.playerService.getRookieIds(),
    defaultValue: null as Set<number> | null,
  });

  // hasValue() rather than value(): a resource in an error state throws when read, and this is
  // a decoration on the table — a rookies request that fails must leave the table standing.
  readonly rookieIds = computed(() =>
    this.rookieResource.hasValue() ? this.rookieResource.value() : null,
  );
  readonly rookiesOnly = signal(false);

  /** Only offer the filter when there is something to filter to. */
  readonly rookiesAvailable = computed(() => {
    const rookies = this.rookieIds();
    return !!rookies && this.players().some((player) => rookies.has(player.id));
  });

  isRookie(playerId: number): boolean {
    return this.rookieIds()?.has(playerId) ?? false;
  }

  /**
   * The current injury report, or null while unknown — still loading, or a server without
   * the projection service, which reads the same way here: no marker rather than a fit league.
   */
  private readonly injuryResource = rxResource({
    stream: () => this.playerService.getInjuries(),
    defaultValue: null as Map<number, PlayerInjury> | null,
  });

  readonly injuries = computed(() =>
    this.injuryResource.hasValue() ? this.injuryResource.value() : null,
  );

  injuryFor(playerId: number): PlayerInjury | null {
    return this.injuries()?.get(playerId) ?? null;
  }

  private filterByRookie(scored: ScoredProjection[]): ScoredProjection[] {
    const rookies = this.rookieIds();
    if (!this.rookiesOnly() || !rookies) {
      return scored;
    }
    return scored.filter((sp) => rookies.has(sp.projection.playerId));
  }

  readonly teamFilter = signal<string>('ALL');
  readonly availableTeams = computed<string[]>(() => {
    const teams = new Set<string>();
    for (const player of this.players()) {
      if (player.teamAbbrev) {
        teams.add(player.teamAbbrev);
      }
    }
    return [...teams].sort((a, b) => a.localeCompare(b));
  });

  private filterByTeam(scored: ScoredProjection[]): ScoredProjection[] {
    const team = this.teamFilter();
    if (team === 'ALL') {
      return scored;
    }
    const players = this.playerMap();
    return scored.filter((sp) => players.get(sp.projection.playerId)?.teamAbbrev === team);
  }

  readonly searchTerm = signal('');

  readonly searchedProjections = computed<ScoredProjection[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const scored = this.filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit();
    if (!term) {
      return scored;
    }
    const players = this.playerMap();
    return scored.filter((sp) =>
      players.get(sp.projection.playerId)!.name.toLowerCase().includes(term),
    );
  });

  readonly matchingCount = computed(() => this.searchedProjections().length);

  readonly visibleCount = linkedSignal({
    source: () => ({
      term: this.searchTerm(),
      position: this.positionFilter(),
      team: this.teamFilter(),
      rookiesOnly: this.rookiesOnly(),
      sortColumn: this.sortColumn(),
      sortDirection: this.sortDirection(),
    }),
    computation: () => this.maxVisiblePlayers() ?? PLAYERS_PER_PAGE,
  });

  readonly visibleProjections = computed<ScoredProjection[]>(() =>
    this.searchedProjections().slice(0, this.visibleCount()),
  );

  readonly hasMore = computed(
    () => this.maxVisiblePlayers() === null && this.visibleCount() < this.matchingCount(),
  );

  editingPlayerId = signal<number | null>(null);
  private readonly lockedOrder = signal<number[]>([]);

  ngOnInit(): void {
    this.initializeProjection();
    // A queued column change belongs to a table that is still on screen; leaving the timer to fire
    // into a destroyed component would push a column onto a parent that has already moved on.
    this.destroyRef.onDestroy(() => {
      this.queuedColumnToggles = [];
      this.pendingFlushTimers.forEach((timer) => clearTimeout(timer));
      this.pendingFlushTimers = [];
    });
  }

  /**
   * Where each player sits in the ranking itself: by fantasy points in a points league and by
   * z-score in a category one, with the goalies below the games minimum kept last exactly as the
   * summary column keeps them.
   *
   * <p>Deliberately not the order on screen. This is the number in brackets beside a position's
   * rank, and it only reads as "and 7th overall" if it is counted off the ranking. Counted off
   * the arrangement, sorting the wingers by hits printed each player's place in a list of
   * hitters instead.
   */
  overallRanks: Signal<Map<number, number>> = computed(() => {
    const summaryValueOf = this.summaryValueResolver();
    const players = this.playerMap();
    const ranked = this.scoredProjections()
      .filter((sp) => players.has(sp.projection.playerId))
      .sort((a, b) => {
        if (a.qualified !== b.qualified) {
          return a.qualified ? -1 : 1;
        }
        return summaryValueOf(b) - summaryValueOf(a);
      });
    return new Map(ranked.map((sp, index) => [sp.projection.playerId, index + 1]));
  });

  /**
   * Whether the rows on screen are a narrowed pool, whichever filter did the narrowing — the
   * position, the team, the rookies. That is what decides whether the # column carries two
   * numbers: narrowed, it counts what is on screen and the ranking follows in brackets, and
   * unfiltered the single number is the ranking already.
   *
   * <p>Measured against the ranking rather than asking each filter in turn, so a filter added
   * later is covered by having narrowed the table, without anything here being told about it.
   */
  readonly isNarrowed = computed(
    () => this.filteredAndSortedProjections().length < this.overallRanks().size,
  );

  positionRanks: Signal<Map<number, number>> = computed(() => {
    return new Map(
      this.filteredAndSortedProjections().map((sp, i) => [sp.projection.playerId, i + 1]),
    );
  });

  private readonly playerMap = computed(() => new Map(this.players().map((p) => [p.id, p])));

  getPlayer(playerId: number): Player {
    return this.playerMap().get(playerId)!;
  }

  /**
   * A team's goalies share one net: the model divides the schedule between them, so their games
   * started add up to it and anything above that is an edit gone wrong.
   *
   * The total is only computed while the player pool is fresh, and is empty otherwise. The check
   * groups by the team a goalie is *shown* on, and that label comes from the cached pool. While
   * the daily sync is paused between seasons the pool keeps a player on the club he left, so his
   * starts land against the wrong crease: on the pool as it stood in September 2026, fifteen of
   * the thirty-two teams read as over the schedule with nothing edited at all.
   */
  private readonly goalieStartsByTeam = computed<ReadonlyMap<string, number>>(() => {
    if (!this.playerPoolIsFresh()) {
      return new Map();
    }
    const players = this.playerMap();
    const totals = new Map<string, number>();
    for (const projection of this.playerProjections()) {
      if (projection.type !== 'goalie') {
        continue;
      }
      const team = players.get(projection.playerId)?.teamAbbrev;
      if (!team) {
        continue;
      }
      totals.set(team, (totals.get(team) ?? 0) + projection.stats.scoring.gs);
    }
    return totals;
  });

  private readonly playerPoolIsFresh = computed(() => {
    const syncedAt = this.playerPoolSyncedAt();
    if (!syncedAt) {
      return false;
    }
    const synced = Date.parse(syncedAt);
    return Number.isFinite(synced) && Date.now() - synced <= POOL_FRESH_FOR_DAYS * MS_PER_DAY;
  });

  teamGoalieStartsFor(playerId: number): number | null {
    const team = this.playerMap().get(playerId)?.teamAbbrev;
    return team ? (this.goalieStartsByTeam().get(team) ?? null) : null;
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  showMore(): void {
    this.visibleCount.update((count) => count + PLAYERS_PER_PAGE);
  }

  private initializeProjection(): void {
    const initial = this.initialProjections();
    if (initial) {
      const players = this.playerMap();
      // An empty pool is not "every one of these players left the league", it is "we do not know
      // the league". Filtering against it would discard the whole projection, and the editor is
      // not supposed to render at all in that state (see draft-projection's error state) — this
      // guard is what makes the table safe on its own if it ever does.
      if (players.size === 0) {
        this.playerProjections.set(initial);
        return;
      }
      const kept = initial.filter((projection) => players.has(projection.playerId));
      this.droppedPlayerCount.set(initial.length - kept.length);
      this.playerProjections.set(kept);
      return;
    }

    const projections: Projection[] = this.players().map((player) => {
      if (player.type === 'skater') {
        return {
          type: 'skater',
          playerId: player.id,
          stats: player.stats,
        };
      } else {
        return {
          type: 'goalie',
          playerId: player.id,
          stats: player.stats,
        };
      }
    });

    this.playerProjections.set(projections);
  }

  private roundStat(value: number, key: DecimalStatKey): number {
    return parseFloat(value.toFixed(this.decimalSettings()[key]));
  }

  onRowFocusIn(playerId: number): void {
    if (this.editingPlayerId() === playerId) return;
    this.lockedOrder.set(this.realTimeSortedProjections().map((sp) => sp.projection.playerId));
    this.editingPlayerId.set(playerId);
  }

  onRowFocusOut(event: FocusEvent): void {
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const currentTarget = event.currentTarget as HTMLElement;
    if (relatedTarget && currentTarget.contains(relatedTarget)) return;
    this.editingPlayerId.set(null);
    // Leaving the row ends the current edit run, so re-entering the same cell later starts a
    // fresh undo step instead of coalescing onto the previous one.
    this.lastEditSignature = null;
  }

  onToiKeydown(playerId: number, event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? 1 : -1;
    this.commitEdit(`${playerId}:toiPerGame`, (playerProjections) =>
      this.projectionUpdateService.applyToiDelta(
        playerProjections,
        playerId,
        delta,
        this.scaleSettings(),
      ),
    );
  }

  onStatInput(playerId: number, key: StatKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const parsed = this.statInfoService.isToiStat(key)
      ? this.toiService.parseToi(raw)
      : parseDecimalInput(raw);
    const decimals = this.decimalSettings();
    const rounded = key in decimals ? this.roundStat(parsed, key as DecimalStatKey) : parsed;
    let value = this.statInfoService.canStatBeNegative(key) ? rounded : Math.max(0, rounded);
    if (this.statInfoService.isPercentageStat(key)) {
      value = Math.min(100, value);
    }
    this.commitEdit(`${playerId}:${key}`, (playerProjections) =>
      this.projectionUpdateService.applyStatValue(
        playerProjections,
        playerId,
        key,
        value,
        this.scaleSettings(),
      ),
    );
  }

  applyFullSeasonGames(scaleStats: boolean, minGamesToScale: number, scaleGoalies = false): void {
    // A unique signature keeps each "Full season" bulk edit as its own undo step.
    this.fullSeasonEditCounter += 1;
    this.commitEdit(`full-season:${this.fullSeasonEditCounter}`, (playerProjections) =>
      this.projectionUpdateService.applyFullSeasonGames(
        playerProjections,
        this.scaleSettings(),
        scaleStats,
        minGamesToScale,
        scaleGoalies,
      ),
    );
  }

  private snapshot(): TableSnapshot {
    return {
      playerProjections: this.playerProjections(),
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
    };
  }

  private restore(snapshot: TableSnapshot): void {
    this.playerProjections.set(snapshot.playerProjections);
    this.activeScoringColumns.set(snapshot.activeScoringColumns);
    this.activeUtilityColumns.set(snapshot.activeUtilityColumns);
  }

  private pushHistory(signature: string): void {
    const coalesce = signature === this.lastEditSignature && this.undoStack().length > 0;
    if (!coalesce) {
      this.undoStack.update((stack) =>
        [...stack, this.snapshot()].slice(-PlayerProjectionsTableComponent.MAX_HISTORY),
      );
    }
    this.redoStack.set([]);
    this.lastEditSignature = signature;
  }

  private commitEdit(
    signature: string,
    mutate: (playerProjections: Projection[]) => Projection[],
  ): void {
    this.pushHistory(signature);
    this.playerProjections.set(mutate(this.playerProjections()));
  }

  toggleScoringColumn(statKey: ScoringStatKey): void {
    this.shownScoringColumns.update((columns) => toggledSet(columns, statKey));
    this.queueColumnToggle(() => {
      this.pushHistory(`column:scoring:${statKey}`);
      this.activeScoringColumns.update((columns) => toggledSet(columns, statKey));
    });
  }

  toggleUtilityColumn(statKey: UtilityStatKey): void {
    this.shownUtilityColumns.update((columns) => toggledSet(columns, statKey));
    this.queueColumnToggle(() => {
      this.pushHistory(`column:utility:${statKey}`);
      this.activeUtilityColumns.update((columns) => toggledSet(columns, statKey));
    });
  }

  /**
   * Holds a column change until the tick the user just made has been painted. A frame callback
   * still runs before that paint, so the work is handed to a task scheduled from inside one —
   * the browser can only reach it once the frame is on screen. The timer alongside it is there
   * because a backgrounded tab stops producing frames altogether, and a change nobody can see
   * still has to land rather than sit in the queue until the tab is looked at again.
   *
   * Ticking several stats in a row queues them all and rescoring happens once, which is both
   * faster and what the menu is for: it deliberately stays open so more than one can be picked.
   */
  private queueColumnToggle(apply: () => void): void {
    this.queuedColumnToggles.push(apply);
    if (this.queuedColumnToggles.length > 1) {
      return;
    }
    requestAnimationFrame(() => this.scheduleFlush(0));
    this.scheduleFlush(COLUMN_APPLY_TIMEOUT_MS);
  }

  private scheduleFlush(delayMs: number): void {
    const timer = setTimeout(() => this.flushColumnToggles(), delayMs);
    this.pendingFlushTimers.push(timer);
  }

  /**
   * Applies every queued column change now. Anything that reads or rewrites the real columns —
   * undo, redo — settles them first rather than racing the frame they are waiting for. Calling it
   * with nothing queued does nothing, which is what lets the frame and the timer above both aim
   * at it without having to know which of them got there first.
   */
  flushColumnToggles(): void {
    this.pendingFlushTimers.forEach((timer) => clearTimeout(timer));
    this.pendingFlushTimers = [];
    const queued = this.queuedColumnToggles;
    this.queuedColumnToggles = [];
    queued.forEach((apply) => apply());
  }

  toggleScale(utilityKey: UtilityStatKey): void {
    this.scaleSettings.update((settings) => ({
      ...settings,
      [utilityKey]: { ...settings[utilityKey], scale: !settings[utilityKey].scale },
    }));
  }

  toggleScaleStat(utilityKey: UtilityStatKey, statKey: ScoringStatKey): void {
    this.scaleSettings.update((settings) => ({
      ...settings,
      [utilityKey]: {
        ...settings[utilityKey],
        scalableStats: toggledSet(settings[utilityKey].scalableStats, statKey),
      },
    }));
  }

  selectScoringType(type: ScoringType): void {
    this.scoringType.set(type);
  }

  undo(): void {
    this.flushColumnToggles();
    const stack = this.undoStack();
    if (stack.length === 0) return;
    this.redoStack.update((redo) => [...redo, this.snapshot()]);
    this.restore(stack[stack.length - 1]);
    this.undoStack.set(stack.slice(0, -1));
    this.lastEditSignature = null;
  }

  redo(): void {
    this.flushColumnToggles();
    const stack = this.redoStack();
    if (stack.length === 0) return;
    this.undoStack.update((undo) => [...undo, this.snapshot()]);
    this.restore(stack[stack.length - 1]);
    this.redoStack.set(stack.slice(0, -1));
    this.lastEditSignature = null;
  }

  onHistoryKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
    if (!isUndo && !isRedo) return;

    // Preserve the browser's native text undo in other editable fields (rename, search).
    // Our stat cells commit each keystroke straight into projection state, so there is no
    // useful native undo to keep there — handle those ourselves.
    const target = event.target as HTMLElement | null;
    const editable = target?.closest('input, textarea, select, [contenteditable="true"]');
    if (editable && !editable.closest('app-stat-input')) return;

    event.preventDefault();
    if (isUndo) {
      this.undo();
    } else {
      this.redo();
    }
  }
}
