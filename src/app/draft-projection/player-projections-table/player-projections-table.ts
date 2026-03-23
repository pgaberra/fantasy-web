import { Component, computed, inject, input, model, OnInit, Signal, signal } from '@angular/core';
import {
  Player,
  SCORING_STAT_KEYS,
  ScoringStatKey,
  StatKey,
  UtilityStatKey,
} from '../../models/player.model';
import { ActiveColumns, PlayerProjection, PlayerScore, PositionFilter, ScoringType } from '../model';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { ProjectionUpdateService } from '../../services/projection-update.service';
import { ToiService } from '../../services/toi.service';
import { PositionFilterService } from '../../services/position-filter.service';
import { DEFAULT_DECIMAL_SETTINGS, DEFAULT_SCALE_SETTINGS, DecimalStatKey, ScaleConfig } from '../projection-settings-section/model';
import { ProjectionsTableHeaderComponent } from './projections-table-header/projections-table-header';
import { ProjectionPlayerRowComponent } from './projection-player-row/projection-player-row';
import { PositionFilterComponent } from './position-filter/position-filter';

@Component({
  selector: 'app-player-projections-table',
  imports: [ProjectionsTableHeaderComponent, ProjectionPlayerRowComponent, PositionFilterComponent],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent implements OnInit {
  readonly scoringType = input.required<ScoringType>();
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly players = input.required<Player[]>();
  readonly activeColumns = input.required<ActiveColumns>();
  readonly scaleSettings = input<Record<UtilityStatKey, ScaleConfig>>(DEFAULT_SCALE_SETTINGS);
  readonly decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = input.required<boolean>();

  readonly playerProjections = signal<PlayerProjection[]>([]);
  private readonly realTimeSortedProjections = computed((): PlayerProjection[] => {
    const projections = this.playerProjections();
    const scores = this.playerScores();
    const scoringType = this.scoringType();
    return [...projections].sort(
      scoringType === 'points'
        ? (a, b) =>
            (scores.get(b.playerId)?.fantasyPoints ?? 0) -
            (scores.get(a.playerId)?.fantasyPoints ?? 0)
        : (a, b) => (scores.get(b.playerId)?.zScore ?? 0) - (scores.get(a.playerId)?.zScore ?? 0),
    );
  });
  readonly filteredAndSortedProjections: Signal<PlayerProjection[]> = computed(() => {
    const projections = this.realTimeSortedProjections();
    const filter = this.positionFilter();
    return this.positionFilterService.filterByPosition(projections, this.playerMap(), filter);
  });
  filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit: Signal<PlayerProjection[]> = computed(() => {
    if (!this.editingPlayerId()) {
      return this.filteredAndSortedProjections();
    }

    const projections = this.playerProjections();
    const filter = this.positionFilter();
    const lockedProjections = this.lockedOrder().map(
      (playerId) => projections.find((pp) => pp.playerId === playerId)!,
    );
    return this.positionFilterService.filterByPosition(lockedProjections, this.playerMap(), filter);
  });

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly projectionUpdateService = inject(ProjectionUpdateService);
  private readonly toiService = inject(ToiService);
  private readonly positionFilterService = inject(PositionFilterService);

  readonly playerScores = computed((): Map<number, PlayerScore> => {
    const projections = this.playerProjections();
    const statWeights = this.statWeights();
    const activeScoringColumns = this.activeColumns().scoringColumns;

    const fantasyPoints = projections.map((pp) => {
      const roundedScoring = { ...pp.stats.scoring };
      SCORING_STAT_KEYS.forEach((key) => {
        roundedScoring[key] = this.roundStat(roundedScoring[key], key);
      });
      return this.projectionCalculationService.computeTotalPoints(
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

  private initializeProjection(): void {
    const playerProjections: PlayerProjection[] = this.players().map((player) => ({
      playerId: player.id,
      stats: player.stats,
    }));

    this.playerProjections.set(playerProjections);
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
    const parsed = key === 'toiPerGame' ? this.toiService.parseToi(raw) : Number(raw);
    const decimals = this.decimalSettings();
    const value = key in decimals ? this.roundStat(parsed, key as DecimalStatKey) : parsed;
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
