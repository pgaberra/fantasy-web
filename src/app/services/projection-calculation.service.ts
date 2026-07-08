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

function sumContributions(contributions: Record<string, number>): number {
  return Object.values(contributions).reduce((sum, value) => sum + value, 0);
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

  computeZScores(
    projections: Projection[],
    activeScoringColumns: Set<ScoringStatKey>,
    skaterPoolSize: number = DEFAULT_SKATER_POOL_SIZE,
    goaliePoolSize: number = DEFAULT_GOALIE_POOL_SIZE,
  ): number[] {
    return this.computeZScoreContributions(
      projections,
      activeScoringColumns,
      skaterPoolSize,
      goaliePoolSize,
    ).map((contributions) => sumContributions(contributions));
  }

  /**
   * Per-category z-score breakdown: for each projection, a map of active category → its z-score
   * contribution (already sign-adjusted for lower-is-better stats). Summing a projection's map
   * yields the same total {@link computeZScores} returns, so callers can attribute a player's
   * z-score to individual categories without recomputing.
   */
  computeZScoreContributions(
    projections: Projection[],
    activeScoringColumns: Set<ScoringStatKey>,
    skaterPoolSize: number = DEFAULT_SKATER_POOL_SIZE,
    goaliePoolSize: number = DEFAULT_GOALIE_POOL_SIZE,
  ): Record<string, number>[] {
    const contributionsByIndex: Record<string, number>[] = projections.map(() => ({}));

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
      skaterPoolSize,
      contributionsByIndex,
    );
    this.applyPoolZScores(
      goalies,
      GOALIE_SCORING_STAT_KEYS,
      (projection, key) => projection.stats.scoring[key],
      activeScoringColumns,
      goaliePoolSize,
      contributionsByIndex,
    );

    return contributionsByIndex;
  }

  private applyPoolZScores<P extends Projection, K extends ScoringStatKey>(
    entries: PoolEntry<P>[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
    poolSize: number,
    contributionsByIndex: Record<string, number>[],
  ): void {
    if (entries.length === 0) {
      return;
    }
    let poolPositions = entries.map((_entry, position) => position);
    let contributions = this.contributionsForEntries(
      entries,
      poolPositions,
      categoryKeys,
      valueOf,
      activeScoringColumns,
    );

    for (let iteration = 0; iteration < MAX_POOL_ITERATIONS; iteration++) {
      const nextPositions = entries
        .map((_entry, position) => position)
        .sort(
          (first, second) =>
            sumContributions(contributions[second]) - sumContributions(contributions[first]),
        )
        .slice(0, poolSize);
      if (this.samePositions(nextPositions, poolPositions)) {
        break;
      }
      poolPositions = nextPositions;
      contributions = this.contributionsForEntries(
        entries,
        poolPositions,
        categoryKeys,
        valueOf,
        activeScoringColumns,
      );
    }

    entries.forEach((entry, position) => {
      contributionsByIndex[entry.index] = contributions[position];
    });
  }

  private contributionsForEntries<P extends Projection, K extends ScoringStatKey>(
    entries: PoolEntry<P>[],
    poolPositions: number[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
  ): Record<string, number>[] {
    const contributions: Record<string, number>[] = entries.map(() => ({}));
    if (poolPositions.length === 0) {
      return contributions;
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
        contributions[position][key] =
          (direction * (valueOf(entry.projection, key) - mean)) / stdDev;
      });
    }
    return contributions;
  }

  private samePositions(first: number[], second: number[]): boolean {
    if (first.length !== second.length) {
      return false;
    }
    const inFirst = new Set(first);
    return second.every((position) => inFirst.has(position));
  }
}
