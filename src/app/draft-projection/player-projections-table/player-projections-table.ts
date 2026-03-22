import { Component, computed, inject, input, model, Signal, signal } from '@angular/core';
import {
  Player,
  SCORING_STAT_KEYS,
  ScoringStatKey,
  StatKey,
  UtilityStatKey,
} from '../../models/player.model';
import { ActiveColumns, PlayerProjection, ScoringType } from '../model';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { ToiService } from '../../services/toi.service';
import { DEFAULT_DECIMAL_SETTINGS, DEFAULT_SCALE_SETTINGS, DecimalStatKey, ScaleConfig } from '../projection-settings-section/model';
import { ProjectionsTableHeaderComponent } from './projections-table-header/projections-table-header';
import { ProjectionPlayerRowComponent } from './projection-player-row/projection-player-row';

@Component({
  selector: 'app-player-projections-table',
  imports: [ProjectionsTableHeaderComponent, ProjectionPlayerRowComponent],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent {
  scoringType = input.required<ScoringType>();
  playerProjections = model.required<PlayerProjection[]>(); // TODO merge this with computedPlayerProjections
  statWeights = model.required<Record<ScoringStatKey, number>>();
  players = input.required<Player[]>();
  activeColumns = input.required<ActiveColumns>();
  scaleSettings = input<Record<UtilityStatKey, ScaleConfig>>(DEFAULT_SCALE_SETTINGS);
  decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  useDefaultDecimals = input.required<boolean>();

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly toiService = inject(ToiService);

  private readonly computedPlayerProjections = computed((): PlayerProjection[] => {
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

    return projections.map((pp, i) => ({
      ...pp,
      fantasyPoints: fantasyPoints[i],
      zScore: zScores[i],
    }));
  });

  editingPlayerId = signal<number | null>(null);
  private readonly lockedOrder = signal<number[]>([]);

  private readonly realTimeSortedProjections = computed((): PlayerProjection[] => {
    const projections = this.computedPlayerProjections();
    const scoringType = this.scoringType();
    return [...projections].sort(
      scoringType === 'points' ? this.sortByPointsDesc : this.sortByZScoreDesc,
    );
  });

  sortedPlayerProjectionsExcludingCurrentPlayerEdit: Signal<PlayerProjection[]> = computed(() => {
    if (!this.editingPlayerId()) {
      return this.realTimeSortedProjections();
    }

    const projections = this.computedPlayerProjections();
    return this.lockedOrder().map(
      (playerId) => projections.find((pp) => pp.playerId === playerId)!,
    );
  });

  realTimeRanks: Signal<Map<number, number>> = computed(() => {
    return new Map(this.realTimeSortedProjections().map((pp, i) => [pp.playerId, i + 1]));
  });

  private readonly sortByPointsDesc = (a: PlayerProjection, b: PlayerProjection) =>
    b.fantasyPoints - a.fantasyPoints;

  private readonly sortByZScoreDesc = (a: PlayerProjection, b: PlayerProjection) =>
    b.zScore - a.zScore;

  private readonly playerMap = computed(() => new Map(this.players().map((p) => [p.id, p])));

  getPlayer(playerId: number): Player {
    return this.playerMap().get(playerId)!;
  }

  private scaleScoring(
    scoring: Record<ScoringStatKey, number>,
    ratio: number,
    scalable: Set<ScoringStatKey>,
  ): Record<ScoringStatKey, number> {
    const scaled = { ...scoring };
    SCORING_STAT_KEYS.forEach((key) => {
      if (scalable.has(key)) {
        scaled[key] = scoring[key] * ratio;
      }
    });
    return scaled;
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
      playerProjections.map((pp) => {
        if (pp.playerId !== playerId) return pp;
        const oldToi = pp.stats.utility.toiPerGame;
        const newToi = Math.max(0, oldToi + delta);
        const toiSettings = this.scaleSettings().toiPerGame;
        const shouldScale = toiSettings.scale && oldToi > 0;
        const scoring = shouldScale
          ? this.scaleScoring(pp.stats.scoring, newToi / oldToi, toiSettings.scalableStats)
          : pp.stats.scoring;
        return {
          ...pp,
          stats: { ...pp.stats, scoring, utility: { ...pp.stats.utility, toiPerGame: newToi } },
        };
      }),
    );
  }

  onStatInput(playerId: number, key: StatKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const parsed = key === 'toiPerGame' ? this.toiService.parseToi(raw) : Number(raw);
    const decimals = this.decimalSettings();
    const value = key in decimals ? this.roundStat(parsed, key as DecimalStatKey) : parsed;
    this.playerProjections.update((playerProjections) =>
      playerProjections.map((pp) => {
        if (pp.playerId !== playerId) return pp;
        const isScoring = (SCORING_STAT_KEYS as readonly string[]).includes(key);
        if (isScoring) {
          return { ...pp, stats: { ...pp.stats, scoring: { ...pp.stats.scoring, [key]: value } } };
        }
        const utilityKey = key as UtilityStatKey;
        const oldValue = pp.stats.utility[utilityKey];
        const settings = this.scaleSettings()[utilityKey];
        const shouldScale = settings ? settings.scale && oldValue > 0 : false;
        const scalable = settings ? settings.scalableStats : new Set<ScoringStatKey>();
        const scoring = shouldScale
          ? this.scaleScoring(pp.stats.scoring, value / oldValue, scalable)
          : pp.stats.scoring;
        return {
          ...pp,
          stats: { ...pp.stats, scoring, utility: { ...pp.stats.utility, [key]: value } },
        };
      }),
    );
  }
}
