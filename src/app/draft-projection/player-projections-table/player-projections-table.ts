import { Component, computed, inject, input, model, Signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  Player,
  SCORING_STAT_KEYS,
  ScoringStatKey,
  StatKey,
  UtilityStatKey,
} from '../../models/player.model';
import { PlayerProjection, ScoringType } from '../model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { FormatToiPipe } from '../../pipes/format-toi.pipe';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { ToiService } from '../../services/toi.service';
import { DEFAULT_DECIMAL_SETTINGS, DEFAULT_SCALE_SETTINGS, DecimalStatKey, ScaleConfig } from '../projection-settings-section/model';

@Component({
  selector: 'app-player-projections-table',
  imports: [DecimalPipe, StatLabelPipe, FormatToiPipe],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent {
  protected readonly Array = Array;
  protected readonly MAX_DECIMAL_SETTING = 3;

  scoringType = input.required<ScoringType>();
  playerProjections = model.required<PlayerProjection[]>();
  statWeights = model.required<Record<ScoringStatKey, number>>();
  players = input.required<Player[]>();
  activeScoringColumns = input.required<Set<ScoringStatKey>>();
  activeUtilityColumns = input.required<Set<UtilityStatKey>>();
  scaleSettings = input<Record<UtilityStatKey, ScaleConfig>>(DEFAULT_SCALE_SETTINGS);
  decimalSettings = model<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  showDecimalRow = input<boolean>(false);

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly toiService = inject(ToiService);

  summaryLabel: Signal<string> = computed(() =>
    this.scoringType() === 'points' ? 'Fan Pts' : 'Z-Score',
  );

  private readonly computedPlayerProjections = computed((): PlayerProjection[] => {
    const projections = this.playerProjections();
    const statWeights = this.statWeights();
    const activeScoringColumns = this.activeScoringColumns();

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

  sortedPlayerProjections = computed((): PlayerProjection[] => {
    const projections = this.computedPlayerProjections();
    const scoringType = this.scoringType();

    return [...projections].sort(
      scoringType === 'points' ? this.sortByPointsDesc : this.sortByZScoreDesc,
    );
  });

  private sortByPointsDesc(a: PlayerProjection, b: PlayerProjection) {
    return b.fantasyPoints - a.fantasyPoints;
  }

  private sortByZScoreDesc(a: PlayerProjection, b: PlayerProjection) {
    return b.zScore - a.zScore;
  }

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
        const oldValue = pp.stats.utility[key as UtilityStatKey];
        const utilityKey = key as UtilityStatKey;
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

  onWeightInput(key: ScoringStatKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.statWeights.update((weights) => ({ ...weights, [key]: value }));
  }

  onDecimalInput(key: DecimalStatKey, event: Event): void {
    const value = Math.max(0, Math.min(this.MAX_DECIMAL_SETTING, Number((event.target as HTMLInputElement).value)));
    this.decimalSettings.update((settings) => ({ ...settings, [key]: value }));
  }

  formatStat(value: number, key: DecimalStatKey): string {
    const decimals = this.decimalSettings()[key];
    return parseFloat(value.toFixed(decimals)).toString();
  }
}
