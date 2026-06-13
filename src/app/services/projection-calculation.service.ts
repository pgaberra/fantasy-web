import { Injectable } from '@angular/core';
import {
  GOALIE_SCORING_STAT_KEYS,
  GoalieScoringStatKey,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SkaterScoringStatKey,
} from '../models/stat-key.model';
import {
  GoalieProjection,
  GoalieScoringStats,
  Projection,
  SkaterProjection,
  SkaterScoringStats,
  StatWeights,
} from '../models/projection.model';

@Injectable({
  providedIn: 'root',
})
export class ProjectionCalculationService {
  computeSkaterTotalPoints(
    stats: SkaterScoringStats,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    return Object.entries(statWeights)
      .filter(([key]) => activeScoringColumns.has(key as ScoringStatKey))
      .reduce((sum, [key, weight]) => sum + (stats[key as SkaterScoringStatKey] ?? 0) * weight, 0);
  }

  computeGoalieTotalPoints(
    stats: GoalieScoringStats,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    return Object.entries(statWeights)
      .filter(([key]) => activeScoringColumns.has(key as ScoringStatKey))
      .reduce((sum, [key, weight]) => sum + (stats[key as GoalieScoringStatKey] ?? 0) * weight, 0);
  }

  computeZScores(
    projections: Projection[],
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): Map<number, number> {
    const zScoreByPlayer = new Map<number, number>();
    projections.forEach((projection) => zScoreByPlayer.set(projection.playerId, 0));

    const skaters = projections.filter(
      (projection): projection is SkaterProjection => projection.type === 'skater',
    );
    const goalies = projections.filter(
      (projection): projection is GoalieProjection => projection.type === 'goalie',
    );

    for (const key of SKATER_SCORING_STAT_KEYS) {
      this.addCategoryZScores(
        skaters,
        key,
        (projection) => projection.stats.scoring[key],
        statWeights,
        activeScoringColumns,
        zScoreByPlayer,
      );
    }
    for (const key of GOALIE_SCORING_STAT_KEYS) {
      this.addCategoryZScores(
        goalies,
        key,
        (projection) => projection.stats.scoring[key],
        statWeights,
        activeScoringColumns,
        zScoreByPlayer,
      );
    }
    return zScoreByPlayer;
  }

  private addCategoryZScores<P extends Projection>(
    group: P[],
    key: ScoringStatKey,
    valueOf: (projection: P) => number,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
    zScoreByPlayer: Map<number, number>,
  ): void {
    const weight = statWeights[key] ?? 0;
    if (group.length === 0 || !activeScoringColumns.has(key) || weight === 0) {
      return;
    }

    const values = group.map(valueOf);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) {
      return;
    }

    group.forEach((projection, index) => {
      const standardized = (values[index] - mean) / stdDev;
      const current = zScoreByPlayer.get(projection.playerId) ?? 0;
      zScoreByPlayer.set(projection.playerId, current + weight * standardized);
    });
  }
}
