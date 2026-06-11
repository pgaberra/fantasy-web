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
  PlayerScore,
  PositionFilter,
  Projection,
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
import { ProjectionsTableHeaderComponent } from './projections-table-header/projections-table-header';
import { PlayerRowComponent } from './player-row/player-row';
import { PositionFilterComponent } from './position-filter/position-filter';
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
  imports: [ProjectionsTableHeaderComponent, PlayerRowComponent, PositionFilterComponent],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent implements OnInit {
  readonly scoringType = input.required<ScoringType>();
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly players = input.required<Player[]>();
  readonly activeColumns = input.required<ActiveColumns>();

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
  private readonly realTimeSortedProjections = computed((): Projection[] => {
    const projections = this.playerProjections();
    const scores = this.playerScores();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    const valueOf = this.sortValueResolver(this.sortColumn(), scores);
    const summaryValueOf = this.sortValueResolver('summary', scores);
    return [...projections].sort((a, b) => {
      const primary = sign * (valueOf(a) - valueOf(b));
      // Ties fall back to fantasy value (desc) so equal-stat players stay meaningfully ordered.
      return primary !== 0 ? primary : summaryValueOf(b) - summaryValueOf(a);
    });
  });

  private sortValueResolver(
    column: SortColumn,
    scores: Map<number, PlayerScore>,
  ): (projection: Projection) => number {
    if (column === 'summary') {
      return this.scoringType() === 'points'
        ? (projection) => scores.get(projection.playerId)?.fantasyPoints ?? 0
        : (projection) => scores.get(projection.playerId)?.zScore ?? 0;
    }
    return (projection) => statValueOf(projection, column);
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('desc');
    }
  }
  readonly filteredAndSortedProjections: Signal<Projection[]> = computed(() => {
    const projections = this.realTimeSortedProjections();
    const filter = this.positionFilter();
    return this.positionFilterService.filterByPosition(projections, this.playerMap(), filter);
  });
  filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit: Signal<Projection[]> = computed(
    () => {
      if (!this.editingPlayerId()) {
        return this.filteredAndSortedProjections();
      }

      const projections = this.playerProjections();
      const filter = this.positionFilter();
      const lockedProjections = this.lockedOrder().map(
        (playerId) => projections.find((pp) => pp.playerId === playerId)!,
      );
      return this.positionFilterService.filterByPosition(
        lockedProjections,
        this.playerMap(),
        filter,
      );
    },
  );

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly projectionUpdateService = inject(ProjectionUpdateService);
  private readonly toiService = inject(ToiService);
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly activeColumnsService = inject(ActiveColumnsService);
  private readonly statInfoService = inject(StatInfoService);

  readonly playerScores = computed((): Map<number, PlayerScore> => {
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
    const zScores = this.projectionCalculationService.computeZScores(fantasyPoints);

    return new Map(
      projections.map((pp, i) => [
        pp.playerId,
        { fantasyPoints: fantasyPoints[i], zScore: zScores[i] },
      ]),
    );
  });

  readonly positionFilter = signal<PositionFilter>('ALL');

  readonly searchTerm = signal('');

  readonly searchedProjections = computed<Projection[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const projections = this.filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit();
    if (!term) {
      return projections;
    }
    const players = this.playerMap();
    return projections.filter((projection) =>
      players.get(projection.playerId)!.name.toLowerCase().includes(term),
    );
  });

  readonly matchingCount = computed(() => this.searchedProjections().length);

  readonly visibleCount = linkedSignal({
    source: () => ({
      term: this.searchTerm(),
      position: this.positionFilter(),
      sortColumn: this.sortColumn(),
      sortDirection: this.sortDirection(),
    }),
    computation: () => PLAYERS_PER_PAGE,
  });

  readonly visibleProjections = computed<Projection[]>(() =>
    this.searchedProjections().slice(0, this.visibleCount()),
  );

  readonly hasMore = computed(() => this.visibleCount() < this.matchingCount());

  editingPlayerId = signal<number | null>(null);
  private readonly lockedOrder = signal<number[]>([]);

  ngOnInit(): void {
    this.initializeProjection();
  }

  realTimeRanks: Signal<Map<number, number>> = computed(() => {
    return new Map(this.realTimeSortedProjections().map((pp, i) => [pp.playerId, i + 1]));
  });

  positionRanks: Signal<Map<number, number>> = computed(() => {
    return new Map(this.filteredAndSortedProjections().map((pp, i) => [pp.playerId, i + 1]));
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
    this.lockedOrder.set(this.realTimeSortedProjections().map((pp) => pp.playerId));
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
