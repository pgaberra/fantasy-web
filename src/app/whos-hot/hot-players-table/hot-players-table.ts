import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  output,
  Signal,
  signal,
} from '@angular/core';
import { Player } from '../../models/player.model';
import {
  ActiveColumns,
  PositionFilter,
  Projection,
  ScoredProjection,
  ScoringType,
  SortColumn,
  SortDirection,
} from '../../models/projection.model';
import { compareStatValues, defaultSortDirection, statValueOf } from '../../models/sorting';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  StatKey,
  UtilityStatKey,
} from '../../models/stat-key.model';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { PositionFilterService } from '../../services/position-filter.service';
import { ActiveColumnsService } from '../../services/active-columns.service';
import { StatInfoService } from '../../services/stat-info.service';
import { HotPlayer } from '../../services/whos-hot.service';
import { RosterSlots } from '../../api/models/roster-slots';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
} from '../../draft-projection/projection-settings-section/model';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../../draft-projection/projection-defaults';
import { PlayerHeadshotComponent } from '../../shared/player-headshot/player-headshot';
import { ProjectionsTableHeaderComponent } from '../../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { PositionFilterComponent } from '../../draft-projection/player-projections-table/position-filter/position-filter';
import { TeamFilterComponent } from '../../draft-projection/player-projections-table/team-filter/team-filter';
import { ColumnsMenuComponent } from '../../draft-projection/player-projections-table/columns-menu/columns-menu';
import { LeagueSettingsMenuComponent } from '../../draft-projection/player-projections-table/league-settings-menu/league-settings-menu';
import { PopoverTriggerDirective } from '../../shared/popover/popover-trigger.directive';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { PinnedTableHeaderDirective } from '../../shared/pinned-table-header/pinned-table-header.directive';
import { TableScrollDirective } from '../../shared/table-scroll/table-scroll.directive';
import { FormatToiPipe } from '../../pipes/format-toi.pipe';
import { DecimalPipe } from '@angular/common';
import { IconComponent } from '../../shared/icon/icon';

const PLAYERS_PER_PAGE = 100;

function toggledSet<T>(members: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(members);
  if (!next.delete(member)) {
    next.add(member);
  }
  return next;
}

interface RankedPlayer extends ScoredProjection {
  hot: HotPlayer;
}

/**
 * The Who's hot leaderboard: measured production over a game range, ranked the way the user's
 * league scores it.
 *
 * Read-only by design. These are numbers that already happened — unlike a projection there is
 * nothing here to edit, so the table shows values rather than inputs. What stays editable is the
 * league: the stat weights in the header, and the toolbar above it, because those decide how the
 * measurement is scored rather than what it measured.
 */
@Component({
  selector: 'app-hot-players-table',
  imports: [
    PlayerHeadshotComponent,
    ProjectionsTableHeaderComponent,
    PositionFilterComponent,
    TeamFilterComponent,
    PopoverTriggerDirective,
    TooltipDirective,
    PinnedTableHeaderDirective,
    TableScrollDirective,
    LeagueSettingsMenuComponent,
    ColumnsMenuComponent,
    FormatToiPipe,
    DecimalPipe,
    IconComponent,
  ],
  templateUrl: './hot-players-table.html',
  styleUrl: './hot-players-table.css',
})
export class HotPlayersTableComponent {
  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly activeColumnsService = inject(ActiveColumnsService);
  private readonly statInfoService = inject(StatInfoService);

  readonly hotPlayers = input.required<HotPlayer[]>();
  readonly players = input.required<Player[]>();
  readonly activeColumns = input.required<ActiveColumns>();
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = input<boolean>(true);
  readonly perGame = input<boolean>(false);
  readonly minGames = input<number>(1);
  /** Named rather than derived, so an empty leaderboard can say which season came back empty. */
  readonly seasonLabel = input.required<string>();

  /**
   * Nothing came back for the whole season, as opposed to nothing surviving the filters. A season
   * that hasn't been played yet is on the dropdown, so this is a normal answer rather than a
   * failure, and telling the user to widen their range would be advice that cannot help.
   */
  readonly seasonNotPlayed = computed(() => this.hotPlayers().length === 0);

  // Everything the settings panel above the table used to own. Two-way, so the page keeps the
  // state it persists while the toolbar is the thing that changes it.
  readonly scoringType = model.required<ScoringType>();
  readonly activeScoringColumns = model<Set<ScoringStatKey>>(new Set<ScoringStatKey>());
  readonly activeUtilityColumns = model<Set<UtilityStatKey>>(new Set<UtilityStatKey>());
  readonly leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = model<number>(DEFAULT_MIN_GOALIE_GAMES);

  /** The league these settings were imported from, once there is one. */
  readonly syncedLeagueName = input<string | null>(null);
  readonly manageSyncRequested = output<void>();

  /**
   * The League setup menu holds the category ranking inputs and, once a league has been imported,
   * where it came from. A points league that has imported nothing leaves it empty — its scoring is
   * the weight row in the table header — so the button is not offered at all.
   */
  readonly hasLeagueSetup = computed(
    () => this.scoringType() === 'category' || !!this.syncedLeagueName(),
  );

  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');
  private readonly positionFilterState = signal<PositionFilter>('ALL');
  readonly positionFilter: Signal<PositionFilter> = this.positionFilterState.asReadonly();
  readonly teamFilter = signal<string>('ALL');
  readonly searchTerm = signal('');

  readonly filteredActiveColumns = computed<ActiveColumns>(() =>
    this.activeColumnsService.filterAndSortActiveColumns(
      this.activeColumns(),
      this.positionFilter(),
    ),
  );

  /**
   * Narrowing to a position can take the sorted column off the screen with it: a leaderboard of
   * left wings has no goalie columns to sort by. Rather than leave the rows in an order nothing
   * on screen explains, the sort falls back to the ranking.
   */
  setPositionFilter(filter: PositionFilter): void {
    this.positionFilterState.set(filter);
    if (
      this.activeColumnsService.showsSortColumn(this.sortColumn(), this.activeColumns(), filter)
    ) {
      return;
    }
    this.sortColumn.set('summary');
    this.sortDirection.set(defaultSortDirection('summary'));
  }

  private readonly playerMap = computed(() => new Map(this.players().map((p) => [p.id, p])));

  readonly availableTeams = computed<string[]>(() => {
    const teams = new Set<string>();
    for (const hot of this.hotPlayers()) {
      if (hot.teamAbbrev) {
        teams.add(hot.teamAbbrev);
      }
    }
    return [...teams].sort((a, b) => a.localeCompare(b));
  });

  /**
   * Players with enough appearances to be worth ranking. Anyone below the threshold is dropped
   * before the z-score pool is built, so a single-game call-up can't skew the baselines the
   * rest of the league is measured against.
   *
   * The threshold only applies in per-game mode, which is where a tiny sample does damage: a
   * rate off two games looks like a superstar. Totals already discount a player who barely
   * played, so filtering them out there would only hide rows nobody was going to be misled by —
   * and the input that sets the number is hidden with the mode, so an unapplied minimum is never
   * left on screen looking as though it were in force.
   */
  private readonly qualifying = computed(() => {
    if (!this.perGame()) {
      return this.hotPlayers();
    }
    const minimum = this.minGames();
    return this.hotPlayers().filter((hot) => hot.games >= minimum);
  });

  /**
   * In per-game mode the counting stats are divided by the games the player actually dressed
   * for. Rates are left alone: a shooting percentage is already a ratio, and dividing it by
   * games would be meaningless.
   */
  private readonly scaledProjections = computed<Projection[]>(() => {
    const players = this.qualifying();
    if (!this.perGame()) {
      return players.map((hot) => hot.projection);
    }
    return players.map((hot) => {
      const games = hot.games;
      if (games <= 0) {
        return hot.projection;
      }
      const keys =
        hot.projection.type === 'skater' ? SKATER_SCORING_STAT_KEYS : GOALIE_SCORING_STAT_KEYS;
      const scoring = { ...(hot.projection.stats.scoring as Record<string, number>) };
      for (const key of keys) {
        if (!this.statInfoService.isRateStat(key)) {
          scoring[key] = scoring[key] / games;
        }
      }
      return {
        ...hot.projection,
        stats: { ...hot.projection.stats, scoring },
      } as Projection;
    });
  });

  readonly rankedPlayers = computed<RankedPlayer[]>(() => {
    const players = this.qualifying();
    const projections = this.scaledProjections();
    const statWeights = this.statWeights();
    const activeScoringColumns = this.activeColumns().scoring;

    const fantasyPoints = projections.map((projection) =>
      projection.type === 'skater'
        ? this.projectionCalculationService.computeSkaterTotalPoints(
            projection.stats.scoring,
            statWeights,
            activeScoringColumns,
          )
        : this.projectionCalculationService.computeGoalieTotalPoints(
            projection.stats.scoring,
            statWeights,
            activeScoringColumns,
          ),
    );

    const roster = this.rosterSlots();
    const skaterPoolSize =
      this.leagueSize() * (roster.c + roster.lw + roster.rw + roster.d + roster.util + roster.bn);
    const goaliePoolSize = this.leagueSize() * roster.g;
    const zScores = this.projectionCalculationService.computeZScores(
      projections,
      activeScoringColumns,
      skaterPoolSize,
      goaliePoolSize,
    );

    const isCategory = this.scoringType() === 'category';
    const goalieMinimum = this.minGoalieGames();

    return projections.map((projection, index) => ({
      projection,
      hot: players[index],
      score: { fantasyPoints: fantasyPoints[index], zScore: zScores[index] },
      qualified:
        !isCategory || projection.type !== 'goalie' || players[index].games >= goalieMinimum,
    }));
  });

  private readonly sortedPlayers = computed<RankedPlayer[]>(() => {
    const ranked = this.rankedPlayers();
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    const tieBreak = (a: RankedPlayer, b: RankedPlayer): number =>
      this.summaryValue(b) - this.summaryValue(a);

    if (column === 'name') {
      return [...ranked].sort((a, b) => {
        const primary = sign * a.hot.name.localeCompare(b.hot.name);
        return primary !== 0 ? primary : tieBreak(a, b);
      });
    }

    const valueOf = this.sortValueResolver(column);
    const demoteUnqualified = column === 'summary';
    return [...ranked].sort((a, b) => {
      if (demoteUnqualified && a.qualified !== b.qualified) {
        return a.qualified ? -1 : 1;
      }
      const primary = compareStatValues(valueOf(a), valueOf(b), sign);
      return primary !== 0 ? primary : tieBreak(a, b);
    });
  });

  private readonly filteredPlayers = computed<RankedPlayer[]>(() => {
    const sorted = this.sortedPlayers();
    const filter = this.positionFilter();
    const team = this.teamFilter();
    const term = this.searchTerm().trim().toLowerCase();
    const players = this.playerMap();
    return sorted.filter((ranked) => {
      if (!this.positionFilterService.matches(ranked.projection, players, filter)) {
        return false;
      }
      if (team !== 'ALL' && ranked.hot.teamAbbrev !== team) {
        return false;
      }
      return !term || ranked.hot.name.toLowerCase().includes(term);
    });
  });

  readonly matchingCount = computed(() => this.filteredPlayers().length);

  readonly visibleCount = linkedSignal({
    source: () => ({
      term: this.searchTerm(),
      position: this.positionFilter(),
      team: this.teamFilter(),
      sortColumn: this.sortColumn(),
      sortDirection: this.sortDirection(),
      perGame: this.perGame(),
    }),
    computation: () => PLAYERS_PER_PAGE,
  });

  readonly visiblePlayers = computed<RankedPlayer[]>(() =>
    this.filteredPlayers().slice(0, this.visibleCount()),
  );

  readonly hasMore = computed(() => this.visibleCount() < this.matchingCount());

  selectScoringType(type: ScoringType): void {
    this.scoringType.set(type);
  }

  toggleScoringColumn(key: ScoringStatKey): void {
    this.activeScoringColumns.update((columns) => toggledSet(columns, key));
  }

  toggleUtilityColumn(key: UtilityStatKey): void {
    this.activeUtilityColumns.update((columns) => toggledSet(columns, key));
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(defaultSortDirection(column));
    }
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  showMore(): void {
    this.visibleCount.update((count) => count + PLAYERS_PER_PAGE);
  }

  headshot(playerId: number): string | undefined {
    return this.playerMap().get(playerId)?.headshot;
  }

  positionLabel(ranked: RankedPlayer): string {
    if (ranked.projection.type === 'goalie') {
      return 'G';
    }
    const player = this.playerMap().get(ranked.projection.playerId);
    return player?.type === 'skater' ? [...player.positions].join('/') : '—';
  }

  /** Display only — `isApplicable` is what decides whether a dash is shown instead of this. */
  statValue(ranked: RankedPlayer, key: StatKey): number {
    return statValueOf(ranked.projection, key) ?? 0;
  }

  isToi(key: StatKey): boolean {
    return this.statInfoService.isToiStat(key);
  }

  /**
   * A stat the player cannot have shows a dash rather than a zero. The split fills every key
   * for every player because the ranking engine works on complete lines, so without this a
   * skater's save percentage and a forward's defencemen points read as measured zeroes.
   */
  isApplicable(ranked: RankedPlayer, key: StatKey): boolean {
    const player = this.playerMap().get(ranked.projection.playerId);
    // Without the player we don't know their positions, and showing the number beats hiding
    // a defenceman's points behind a dash.
    return !player || this.statInfoService.isStatApplicable(key, player);
  }

  /**
   * Per-game counting stats need decimals to say anything — a rounded 0 goals per game is
   * indistinguishable from a rounded 0.4, which is a 33-goal pace. Games played is the divisor
   * rather than a divided stat, so it stays the whole number it always is.
   *
   * The minimum matches the maximum so a column set to N decimals shows N of them: a whole
   * number under a 3-decimal setting reads `272.000`, not `272`.
   */
  decimalsFor(key: StatKey): string {
    const configured = this.decimalSettings()[key as DecimalStatKey] ?? 0;
    const isDividedByGames =
      key !== 'gp' && !this.statInfoService.isRateStat(key) && !this.isToi(key);
    const decimals = this.perGame() && isDividedByGames ? Math.max(configured, 2) : configured;
    return `1.${decimals}-${decimals}`;
  }

  summaryValue(ranked: RankedPlayer): number {
    return this.scoringType() === 'category' ? ranked.score.zScore : ranked.score.fantasyPoints;
  }

  private sortValueResolver(
    column: Exclude<SortColumn, 'name'>,
  ): (ranked: RankedPlayer) => number | null {
    if (column === 'summary') {
      return (ranked) => this.summaryValue(ranked);
    }
    return (ranked) => statValueOf(ranked.projection, column);
  }
}
