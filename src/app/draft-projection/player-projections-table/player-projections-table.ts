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

@Component({
  selector: 'app-player-projections-table',
  imports: [DecimalPipe, StatLabelPipe, FormatToiPipe],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent {
  protected readonly Array = Array;

  scoringType = input.required<ScoringType>();
  playerProjections = model.required<PlayerProjection[]>();
  statWeights = model.required<Record<ScoringStatKey, number>>();
  players = input.required<Player[]>();
  activeScoringColumns = input.required<Set<ScoringStatKey>>();
  activeUtilityColumns = input.required<Set<UtilityStatKey>>();

  private readonly projectionCalculationService = inject(ProjectionCalculationService);
  private readonly toiService = inject(ToiService);

  summaryLabel: Signal<string> = computed(() => this.scoringType() === 'points' ? 'Fan Pts' : 'Z-Score');

  private readonly computedPlayerProjections = computed((): PlayerProjection[] => {
    const projections = this.playerProjections();
    const statWeights = this.statWeights();
    const activeScoringColumns = this.activeScoringColumns();

    const fantasyPoints = projections.map((pp) =>
      this.projectionCalculationService.computeTotalPoints(
        pp.stats.scoring,
        statWeights,
        activeScoringColumns,
      ),
    );
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


  onToiKeydown(playerId: number, event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? 1 : -1;
    this.playerProjections.update((playerProjections) =>
      playerProjections.map((pp) => {
        if (pp.playerId !== playerId) return pp;
        const current = pp.stats.utility.toiPerGame;
        const updated = Math.max(0, current + delta);
        return { ...pp, stats: { ...pp.stats, utility: { ...pp.stats.utility, toiPerGame: updated } } };
      }),
    );
  }

  onStatInput(playerId: number, key: StatKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = key === 'toiPerGame' ? this.toiService.parseToi(raw) : Number(raw);
    this.playerProjections.update((playerProjections) =>
      playerProjections.map((pp) => {
        if (pp.playerId !== playerId) return pp;
        const isScoring = (SCORING_STAT_KEYS as readonly string[]).includes(key);
        const stats = isScoring
          ? { ...pp.stats, scoring: { ...pp.stats.scoring, [key]: value } }
          : { ...pp.stats, utility: { ...pp.stats.utility, [key]: value } };
        return { ...pp, stats };
      }),
    );
  }

  onWeightInput(key: ScoringStatKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.statWeights.update((weights) => ({ ...weights, [key]: value }));
  }
}
