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

/**
 * One pass of z-scores over a pool: per active category, every entry's contribution, plus the
 * running total per entry. The totals are kept alongside rather than summed from the per-category
 * arrays because the pool is re-derived by sorting on them — recomputing a sum inside that
 * comparator is what made this the slowest thing on the page.
 *
 * A category whose pool has no spread is `null` rather than an array of zeroes, so it stays out
 * of the per-category breakdown entirely.
 */
interface PoolZScores {
  totals: Float64Array;
  byCategory: (Float64Array | null)[];
}

@Injectable({
  providedIn: 'root',
})
export class ProjectionCalculationService {
  /**
   * The weights that are actually scored, in the order they sit in `statWeights`. Callers run this
   * over the whole player pool with the same two arguments every time, so the list is derived once
   * per pass rather than once per player — building it per player allocated a pair of arrays for
   * every stat of every player.
   */
  private scoredWeights: {
    statWeights: StatWeights;
    activeScoringColumns: Set<ScoringStatKey>;
    entries: [ScoringStatKey, number][];
  } | null = null;

  private activeWeights(
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): [ScoringStatKey, number][] {
    const cached = this.scoredWeights;
    if (
      cached &&
      cached.statWeights === statWeights &&
      cached.activeScoringColumns === activeScoringColumns
    ) {
      return cached.entries;
    }
    const entries = (Object.entries(statWeights) as [ScoringStatKey, number][]).filter(([key]) =>
      activeScoringColumns.has(key),
    );
    this.scoredWeights = { statWeights, activeScoringColumns, entries };
    return entries;
  }

  computeSkaterTotalPoints(
    stats: SkaterScoringStats,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    let total = 0;
    for (const [key, weight] of this.activeWeights(statWeights, activeScoringColumns)) {
      total += (stats[key as SkaterScoringStatKey] ?? 0) * weight;
    }
    return total;
  }

  computeGoalieTotalPoints(
    stats: GoalieScoringStats,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    let total = 0;
    for (const [key, weight] of this.activeWeights(statWeights, activeScoringColumns)) {
      total += (stats[key as GoalieScoringStatKey] ?? 0) * weight;
    }
    return total;
  }

  computeZScores(
    projections: Projection[],
    activeScoringColumns: Set<ScoringStatKey>,
    skaterPoolSize: number = DEFAULT_SKATER_POOL_SIZE,
    goaliePoolSize: number = DEFAULT_GOALIE_POOL_SIZE,
  ): number[] {
    const totalsByIndex: number[] = projections.map(() => 0);
    this.scorePools(
      projections,
      activeScoringColumns,
      skaterPoolSize,
      goaliePoolSize,
      totalsByIndex,
      null,
    );
    return totalsByIndex;
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
    this.scorePools(
      projections,
      activeScoringColumns,
      skaterPoolSize,
      goaliePoolSize,
      projections.map(() => 0),
      contributionsByIndex,
    );
    return contributionsByIndex;
  }

  /**
   * Skaters and goalies are ranked against their own pool, so each is scored separately and the
   * results written back at the projection's own index. `contributionsByIndex` is filled in only
   * when a caller asked for the per-category breakdown — the ranking itself needs the totals, and
   * building a record per player is the more expensive half of the job.
   */
  private scorePools(
    projections: Projection[],
    activeScoringColumns: Set<ScoringStatKey>,
    skaterPoolSize: number,
    goaliePoolSize: number,
    totalsByIndex: number[],
    contributionsByIndex: Record<string, number>[] | null,
  ): void {
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
      totalsByIndex,
      contributionsByIndex,
    );
    this.applyPoolZScores(
      goalies,
      GOALIE_SCORING_STAT_KEYS,
      (projection, key) => projection.stats.scoring[key],
      activeScoringColumns,
      goaliePoolSize,
      totalsByIndex,
      contributionsByIndex,
    );
  }

  private applyPoolZScores<P extends Projection, K extends ScoringStatKey>(
    entries: PoolEntry<P>[],
    categoryKeys: readonly K[],
    valueOf: (projection: P, key: K) => number,
    activeScoringColumns: Set<ScoringStatKey>,
    poolSize: number,
    totalsByIndex: number[],
    contributionsByIndex: Record<string, number>[] | null,
  ): void {
    if (entries.length === 0) {
      return;
    }
    const activeKeys = categoryKeys.filter((key) => activeScoringColumns.has(key));
    // Each category's values are read out once. The pool is re-derived up to MAX_POOL_ITERATIONS
    // times and every pass would otherwise walk the same projections again for the same numbers.
    const valuesByCategory = activeKeys.map((key) => {
      const values = new Float64Array(entries.length);
      entries.forEach((entry, position) => {
        values[position] = valueOf(entry.projection, key);
      });
      return values;
    });

    let poolPositions = entries.map((_entry, position) => position);
    let zScores = this.zScoresForPool(valuesByCategory, activeKeys, poolPositions, entries.length);

    for (let iteration = 0; iteration < MAX_POOL_ITERATIONS; iteration++) {
      const { totals } = zScores;
      const nextPositions = entries
        .map((_entry, position) => position)
        .sort((first, second) => totals[second] - totals[first])
        .slice(0, poolSize);
      if (this.samePositions(nextPositions, poolPositions)) {
        break;
      }
      poolPositions = nextPositions;
      zScores = this.zScoresForPool(valuesByCategory, activeKeys, poolPositions, entries.length);
    }

    entries.forEach((entry, position) => {
      totalsByIndex[entry.index] = zScores.totals[position];
    });
    if (!contributionsByIndex) {
      return;
    }
    entries.forEach((entry, position) => {
      const contributions: Record<string, number> = {};
      activeKeys.forEach((key, category) => {
        const categoryZScores = zScores.byCategory[category];
        if (categoryZScores) {
          contributions[key] = categoryZScores[position];
        }
      });
      contributionsByIndex[entry.index] = contributions;
    });
  }

  /**
   * Mean and standard deviation come from the pool; the z-scores are then handed out to every
   * entry, pool member or not, so a player outside the drafted pool still gets a comparable value.
   */
  private zScoresForPool<K extends ScoringStatKey>(
    valuesByCategory: Float64Array[],
    activeKeys: readonly K[],
    poolPositions: number[],
    size: number,
  ): PoolZScores {
    const totals = new Float64Array(size);
    const byCategory: (Float64Array | null)[] = activeKeys.map(() => null);
    if (poolPositions.length === 0) {
      return { totals, byCategory };
    }

    activeKeys.forEach((key, category) => {
      const values = valuesByCategory[category];
      let sum = 0;
      for (const position of poolPositions) {
        sum += values[position];
      }
      const mean = sum / poolPositions.length;
      let squaredDeviations = 0;
      for (const position of poolPositions) {
        squaredDeviations += (values[position] - mean) ** 2;
      }
      const stdDev = Math.sqrt(squaredDeviations / poolPositions.length);
      if (stdDev === 0) {
        return;
      }
      const direction = LOWER_IS_BETTER_SCORING_STAT_KEYS.has(key) ? -1 : 1;
      const categoryZScores = new Float64Array(size);
      for (let position = 0; position < size; position++) {
        const zScore = (direction * (values[position] - mean)) / stdDev;
        categoryZScores[position] = zScore;
        totals[position] += zScore;
      }
      byCategory[category] = categoryZScores;
    });

    return { totals, byCategory };
  }

  private samePositions(first: number[], second: number[]): boolean {
    if (first.length !== second.length) {
      return false;
    }
    const inFirst = new Set(first);
    return second.every((position) => inFirst.has(position));
  }
}
