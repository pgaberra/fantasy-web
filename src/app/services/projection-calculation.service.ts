import { Injectable } from '@angular/core';
import {
  GOALIE_SCORING_STAT_KEYS,
  GoalieScoringStatKey,
  LOWER_IS_BETTER_SCORING_STAT_KEYS,
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

const DEFAULT_SKATER_POOL_SIZE = 180;
const DEFAULT_GOALIE_POOL_SIZE = 32;
const MAX_POOL_ITERATIONS = 10;

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
    activeScoringColumns: Set<ScoringStatKey>,
  ): Map<number, number> {
    const skaters = projections.filter(
      (projection): projection is SkaterProjection => projection.type === 'skater',
    );
    const goalies = projections.filter(
      (projection): projection is GoalieProjection => projection.type === 'goalie',
    );

    const zScoreByPlayer = new Map<number, number>();
    projections.forEach((projection) => zScoreByPlayer.set(projection.playerId, 0));

    this.computePoolZScores(
      skaters,
      SKATER_SCORING_STAT_KEYS,
      (projection, key) => projection.stats.scoring[key],
      activeScoringColumns,
      DEFAULT_SKATER_POOL_SIZE,
    ).forEach((zScore, playerId) => zScoreByPlayer.set(playerId, zScore));

    this.computePoolZScores(
      goalies,
      GOALIE_SCORING_STAT_KEYS,
      (projection, key) => projection.stats.scoring[key],
      activeScoringColumns,
      DEFAULT_GOALIE_POOL_SIZE,
    ).forEach((zScore, playerId) => zScoreByPlayer.set(playerId, zScore));

    return zScoreByPlayer;
  }

  private computePoolZScores<P extends Projection, K extends ScoringStatKey>(
    group: P[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
    poolSize: number,
  ): Map<number, number> {
    let pool = group;
    let zScores = this.zScoresForGroup(group, pool, categoryKeys, valueOf, activeScoringColumns);

    for (let iteration = 0; iteration < MAX_POOL_ITERATIONS; iteration++) {
      const nextPool = this.topByScore(group, zScores, poolSize);
      if (this.samePool(nextPool, pool)) {
        break;
      }
      pool = nextPool;
      zScores = this.zScoresForGroup(group, pool, categoryKeys, valueOf, activeScoringColumns);
    }
    return zScores;
  }

  private zScoresForGroup<P extends Projection, K extends ScoringStatKey>(
    group: P[],
    baseline: P[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
  ): Map<number, number> {
    const zScoreByPlayer = new Map<number, number>();
    group.forEach((projection) => zScoreByPlayer.set(projection.playerId, 0));

    for (const key of categoryKeys) {
      if (baseline.length === 0 || !activeScoringColumns.has(key)) {
        continue;
      }
      const baselineValues = baseline.map((projection) => valueOf(projection, key));
      const mean = baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length;
      const variance =
        baselineValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / baselineValues.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev === 0) {
        continue;
      }
      const direction = LOWER_IS_BETTER_SCORING_STAT_KEYS.has(key) ? -1 : 1;
      group.forEach((projection) => {
        const standardized = (valueOf(projection, key) - mean) / stdDev;
        const current = zScoreByPlayer.get(projection.playerId) ?? 0;
        zScoreByPlayer.set(projection.playerId, current + direction * standardized);
      });
    }
    return zScoreByPlayer;
  }

  private topByScore<P extends Projection>(
    group: P[],
    zScores: Map<number, number>,
    poolSize: number,
  ): P[] {
    return [...group]
      .sort(
        (first, second) => (zScores.get(second.playerId) ?? 0) - (zScores.get(first.playerId) ?? 0),
      )
      .slice(0, poolSize);
  }

  private samePool<P extends Projection>(first: P[], second: P[]): boolean {
    if (first.length !== second.length) {
      return false;
    }
    const idsInFirst = new Set(first.map((projection) => projection.playerId));
    return second.every((projection) => idsInFirst.has(projection.playerId));
  }
}
