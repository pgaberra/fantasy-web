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

interface PoolEntry<P extends Projection> {
  projection: P;
  index: number;
}

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

  computeZScores(projections: Projection[], activeScoringColumns: Set<ScoringStatKey>): number[] {
    const zByIndex = projections.map(() => 0);

    const skaters: PoolEntry<SkaterProjection>[] = [];
    const goalies: PoolEntry<GoalieProjection>[] = [];
    projections.forEach((projection, index) => {
      if (projection.type === 'skater') {
        skaters.push({ projection, index });
      } else {
        goalies.push({ projection, index });
      }
    });

    this.applyPoolZScores(
      skaters,
      SKATER_SCORING_STAT_KEYS,
      (projection, key) => projection.stats.scoring[key],
      activeScoringColumns,
      DEFAULT_SKATER_POOL_SIZE,
      zByIndex,
    );
    this.applyPoolZScores(
      goalies,
      GOALIE_SCORING_STAT_KEYS,
      (projection, key) => projection.stats.scoring[key],
      activeScoringColumns,
      DEFAULT_GOALIE_POOL_SIZE,
      zByIndex,
    );

    return zByIndex;
  }

  private applyPoolZScores<P extends Projection, K extends ScoringStatKey>(
    entries: PoolEntry<P>[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
    poolSize: number,
    zByIndex: number[],
  ): void {
    if (entries.length === 0) {
      return;
    }
    let poolPositions = entries.map((_entry, position) => position);
    let zScores = this.zScoresForEntries(
      entries,
      poolPositions,
      categoryKeys,
      valueOf,
      activeScoringColumns,
    );

    for (let iteration = 0; iteration < MAX_POOL_ITERATIONS; iteration++) {
      const nextPositions = entries
        .map((_entry, position) => position)
        .sort((first, second) => zScores[second] - zScores[first])
        .slice(0, poolSize);
      if (this.samePositions(nextPositions, poolPositions)) {
        break;
      }
      poolPositions = nextPositions;
      zScores = this.zScoresForEntries(
        entries,
        poolPositions,
        categoryKeys,
        valueOf,
        activeScoringColumns,
      );
    }

    entries.forEach((entry, position) => {
      zByIndex[entry.index] = zScores[position];
    });
  }

  private zScoresForEntries<P extends Projection, K extends ScoringStatKey>(
    entries: PoolEntry<P>[],
    poolPositions: number[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number[] {
    const zScores = entries.map(() => 0);
    if (poolPositions.length === 0) {
      return zScores;
    }

    for (const key of categoryKeys) {
      if (!activeScoringColumns.has(key)) {
        continue;
      }
      const baselineValues = poolPositions.map((position) =>
        valueOf(entries[position].projection, key),
      );
      const mean = baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length;
      const variance =
        baselineValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / baselineValues.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev === 0) {
        continue;
      }
      const direction = LOWER_IS_BETTER_SCORING_STAT_KEYS.has(key) ? -1 : 1;
      entries.forEach((entry, position) => {
        zScores[position] += (direction * (valueOf(entry.projection, key) - mean)) / stdDev;
      });
    }
    return zScores;
  }

  private samePositions(first: number[], second: number[]): boolean {
    if (first.length !== second.length) {
      return false;
    }
    const inFirst = new Set(first);
    return second.every((position) => inFirst.has(position));
  }
}
