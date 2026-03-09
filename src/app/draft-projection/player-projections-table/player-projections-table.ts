import { Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Player, ScoringStatKey, StatKey, UtilityStatKey } from '../../models/player.model';
import { PlayerProjection, Projection } from '../model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { StatUpdateEvent, WeightUpdateEvent } from './model';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';

@Component({
  selector: 'app-player-projections-table',
  imports: [DecimalPipe, StatLabelPipe],
  templateUrl: './player-projections-table.html',
  styleUrl: './player-projections-table.css',
})
export class PlayerProjectionsTableComponent {
  protected readonly Array = Array;

  projection = input.required<Projection>();
  players = input.required<Player[]>();
  activeScoringColumns = input.required<Set<ScoringStatKey>>();
  activeUtilityColumns = input.required<Set<UtilityStatKey>>();

  statUpdated = output<StatUpdateEvent>();
  weightUpdated = output<WeightUpdateEvent>();

  private projectionCalculationService = inject(ProjectionCalculationService);

  scoringType = computed(() => this.projection().scoringType);
  summaryLabel = computed(() => (this.scoringType() === 'points' ? '⭐ Fan Pts' : '⭐ Z-Score'));

  private readonly playerProjections = computed((): PlayerProjection[] => {
    const projections = this.projection().playerProjections;
    const statWeights = this.projection().statWeights;
    const activeScoringColumns = this.activeScoringColumns();

    const fantasyPoints = projections.map((pp) =>
      this.projectionCalculationService.computeTotalPoints(
        pp.stats.scoring,
        statWeights,
        activeScoringColumns
      ),
    );
    const zScores = this.projectionCalculationService.computeZScores(fantasyPoints);

    return projections.map((pp, i) => ({
      ...pp,
      fantasyPoints: fantasyPoints[i],
      zScore: zScores[i]
    }));
  });

  sortedPlayerProjections = computed((): PlayerProjection[] => {
    const projections = this.playerProjections();
    const scoringType = this.scoringType();

    return [...projections].sort(scoringType === 'points' ? this.sortByPointsDesc : this.sortByZScoreDesc);
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

  onStatInput(playerId: number, key: StatKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.statUpdated.emit({ playerId, key, value });
  }

  onWeightInput(key: ScoringStatKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.weightUpdated.emit({ key, value });
  }
}
