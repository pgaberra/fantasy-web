import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  OnInit,
  Signal,
  signal,
} from '@angular/core';
import { Player } from '../../models/player.model';
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

const PLAYERS_PER_PAGE = 250;

function statValueOf(projection: Projection, key: StatKey): number {
  const scoring = projection.stats.scoring as Record<string, number>;
  const utility = projection.stats.utility as Record<string, number>;
  const value = scoring[key] ?? utility[key];
  return typeof value === 'number' ? value : 0;
}

@Component({
  selector: 'app-player-projections-table',
  imports: [
    ProjectionsTableHeaderComponent,
    PlayerRowComponent,
    PositionFilterComponent,
    TeamFilterComponent,
  ],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent implements OnInit {
  readonly scoringType = input.required<ScoringType>();
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly players = input.required<Player[]>();
  readonly initialProjections = input<Projection[] | null>(null);
  readonly activeColumns = input.required<ActiveColumns>();
  readonly leagueSize = input<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = input<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = input<number>(DEFAULT_MIN_GOALIE_GAMES);

  readonly filteredActiveColumns = computed<ActiveColumns>(() =>
    this.activeColumnsService.filterAndSortActiveColumns(
      this.activeColumns(),
      this.positionFilter(),
    ),
  );
  readonly scaleSettings = input.required<Record<UtilityStatKey, ScaleConfig>>();
  readonly decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = input.required<boolean>();

  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');

  readonly playerProjections = signal<Projection[]>([]);
  private readonly realTimeSortedProjections = computed((): ScoredProjection[] => {
    const scored = this.scoredProjections();
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    const summaryValueOf = this.sortValueResolver('summary');
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
      const primary = sign * (valueOf(a) - valueOf(b));
      // Ties fall back to fantasy value (desc) so equal-stat players stay meaningfully ordered.
      return primary !== 0 ? primary : tieBreak(a, b);
    });
  });

  private sortValueResolver(
    column: Exclude<SortColumn, 'name'>,
  ): (scoredProjection: ScoredProjection) => number {
    if (column === 'summary') {
      return this.scoringType() === 'points'
        ? (scoredProjection) => scoredProjection.score.fantasyPoints
        : (scoredProjection) => scoredProjection.score.zScore;
    }
    return (scoredProjection) => statValueOf(scoredProjection.projection, column);
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('desc');
    }
  }
  readonly filteredAndSortedProjections: Signal<ScoredProjection[]> = computed(() => {
    const scored = this.realTimeSortedProjections();
    const filter = this.positionFilter();
    const players = this.playerMap();
    const byPosition = scored.filter((sp) =>
      this.positionFilterService.matches(sp.projection, players, filter),
    );
    return this.filterByTeam(byPosition);
  });
  filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit: Signal<ScoredProjection[]> =
    computed(() => {
      if (!this.editingPlayerId()) {
        return this.filteredAndSortedProjections();
      }

      const scored = this.scoredProjections();
      const filter = this.positionFilter();
      const players = this.playerMap();
      const lockedProjections = this.lockedOrder().map(
        (playerId) => scored.find((sp) => sp.projection.playerId === playerId)!,
      );
      const byPosition = lockedProjections.filter((sp) =>
        this.positionFilterService.matches(sp.projection, players, filter),
      );
      return this.filterByTeam(byPosition);
    });

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly projectionUpdateService = inject(ProjectionUpdateService);
  private readonly toiService = inject(ToiService);
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly activeColumnsService = inject(ActiveColumnsService);
  private readonly statInfoService = inject(StatInfoService);

  readonly scoredProjections = computed((): ScoredProjection[] => {
    const projections = this.playerProjections();
    const statWeights = this.statWeights();
    const activeScoringColumns = this.activeColumns().scoring;

    const fantasyPoints = projections.map((pp) => {
      if (pp.type === 'skater') {
        const roundedScoring: SkaterScoringStats = { ...pp.stats.scoring };
        SKATER_SCORING_STAT_KEYS.forEach((key) => {
          roundedScoring[key] = this.roundStat(roundedScoring[key], key as DecimalStatKey);
        });
        return this.projectionCalculationService.computeSkaterTotalPoints(
          roundedScoring,
          statWeights,
          activeScoringColumns,
        );
      }
      const roundedScoring: GoalieScoringStats = { ...pp.stats.scoring };
      GOALIE_SCORING_STAT_KEYS.forEach((key) => {
        roundedScoring[key] = this.roundStat(roundedScoring[key], key as DecimalStatKey);
      });
      return this.projectionCalculationService.computeGoalieTotalPoints(
        roundedScoring,
        statWeights,
        activeScoringColumns,
      );
    });
    const roster = this.rosterSlots();
    const teams = this.leagueSize();
    const skaterPoolSize =
      teams * (roster.c + roster.lw + roster.rw + roster.d + roster.util + roster.bn);
    const goaliePoolSize = teams * roster.g;
    const zScores = this.projectionCalculationService.computeZScores(
      projections,
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
    return (projection.stats.utility.gp ?? 0) >= minGames;
  }

  readonly positionFilter = signal<PositionFilter>('ALL');

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
      sortColumn: this.sortColumn(),
      sortDirection: this.sortDirection(),
    }),
    computation: () => PLAYERS_PER_PAGE,
  });

  readonly visibleProjections = computed<ScoredProjection[]>(() =>
    this.searchedProjections().slice(0, this.visibleCount()),
  );

  readonly hasMore = computed(() => this.visibleCount() < this.matchingCount());

  editingPlayerId = signal<number | null>(null);
  private readonly lockedOrder = signal<number[]>([]);

  ngOnInit(): void {
    this.initializeProjection();
  }

  realTimeRanks: Signal<Map<number, number>> = computed(() => {
    return new Map(
      this.realTimeSortedProjections().map((sp, i) => [sp.projection.playerId, i + 1]),
    );
  });

  positionRanks: Signal<Map<number, number>> = computed(() => {
    return new Map(
      this.filteredAndSortedProjections().map((sp, i) => [sp.projection.playerId, i + 1]),
    );
  });

  private readonly playerMap = computed(() => new Map(this.players().map((p) => [p.id, p])));

  getPlayer(playerId: number): Player {
    return this.playerMap().get(playerId)!;
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
      this.playerProjections.set(initial.filter((projection) => players.has(projection.playerId)));
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
  }

  onToiKeydown(playerId: number, event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? 1 : -1;
    this.playerProjections.update((playerProjections) =>
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
      : Number(raw);
    const decimals = this.decimalSettings();
    const rounded = key in decimals ? this.roundStat(parsed, key as DecimalStatKey) : parsed;
    let value = this.statInfoService.canStatBeNegative(key) ? rounded : Math.max(0, rounded);
    if (this.statInfoService.isPercentageStat(key)) {
      value = Math.min(100, value);
    }
    this.playerProjections.update((playerProjections) =>
      this.projectionUpdateService.applyStatValue(
        playerProjections,
        playerId,
        key,
        value,
        this.scaleSettings(),
      ),
    );
  }
}
