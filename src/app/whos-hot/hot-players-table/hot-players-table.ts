import { Component, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
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
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  StatKey,
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
import { ProjectionsTableHeaderComponent } from '../../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { PositionFilterComponent } from '../../draft-projection/player-projections-table/position-filter/position-filter';
import { TeamFilterComponent } from '../../draft-projection/player-projections-table/team-filter/team-filter';
import { FormatToiPipe } from '../../pipes/format-toi.pipe';
import { DecimalPipe } from '@angular/common';

const PLAYERS_PER_PAGE = 100;

interface RankedPlayer extends ScoredProjection {
  hot: HotPlayer;
}

function statValueOf(projection: Projection, key: StatKey): number {
  const scoring = projection.stats.scoring as Record<string, number>;
  const utility = projection.stats.utility as Record<string, number>;
  const value = scoring[key] ?? utility[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * The Who's hot leaderboard: measured production over a game range, ranked the way the user's
 * league scores it.
 *
 * Read-only by design. These are numbers that already happened — unlike a projection there is
 * nothing here to edit, so the table shows values rather than inputs. The stat weights in the
 * header stay editable, because those belong to the league, not to the measurement.
 */
@Component({
  selector: 'app-hot-players-table',
  imports: [
    ProjectionsTableHeaderComponent,
    PositionFilterComponent,
    TeamFilterComponent,
    FormatToiPipe,
    DecimalPipe,
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
  readonly scoringType = input.required<ScoringType>();
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = input<boolean>(true);
  readonly leagueSize = input<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = input<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = input<number>(DEFAULT_MIN_GOALIE_GAMES);
  readonly perGame = input<boolean>(false);
  readonly minGames = input<number>(1);

  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly positionFilter = signal<PositionFilter>('ALL');
  readonly teamFilter = signal<string>('ALL');
  readonly searchTerm = signal('');

  readonly filteredActiveColumns = computed<ActiveColumns>(() =>
    this.activeColumnsService.filterAndSortActiveColumns(
      this.activeColumns(),
      this.positionFilter(),
    ),
  );

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
   */
  private readonly qualifying = computed(() =>
    this.hotPlayers().filter((hot) => hot.games >= this.minGames()),
  );

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
    const summaryValueOf = this.sortValueResolver('summary');
    const tieBreak = (a: RankedPlayer, b: RankedPlayer): number =>
      summaryValueOf(b) - summaryValueOf(a);

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
      const primary = sign * (valueOf(a) - valueOf(b));
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

  onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('desc');
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

  statValue(ranked: RankedPlayer, key: StatKey): number {
    return statValueOf(ranked.projection, key);
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
   * indistinguishable from a rounded 0.4, which is a 33-goal pace.
   */
  decimalsFor(key: StatKey): string {
    const configured = this.decimalSettings()[key as DecimalStatKey] ?? 0;
    const isCountingStat = !this.statInfoService.isRateStat(key) && !this.isToi(key);
    const decimals = this.perGame() && isCountingStat ? Math.max(configured, 2) : configured;
    return `1.0-${decimals}`;
  }

  summaryValue(ranked: RankedPlayer): number {
    return this.scoringType() === 'category' ? ranked.score.zScore : ranked.score.fantasyPoints;
  }

  private sortValueResolver(column: Exclude<SortColumn, 'name'>): (ranked: RankedPlayer) => number {
    if (column === 'summary') {
      return (ranked) => this.summaryValue(ranked);
    }
    return (ranked) => statValueOf(ranked.projection, column);
  }
}
