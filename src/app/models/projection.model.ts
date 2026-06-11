import {
  GoalieScoringStatKey,
  GoalieUtilityStatKey,
  ScoringStatKey,
  SkaterScoringStatKey,
  SkaterUtilityStatKey,
  StatKey,
} from './stat-key.model';

export type ScoringType = 'category' | 'points';
export type PositionFilter = 'ALL' | 'LW' | 'C' | 'RW' | 'D' | 'G' | 'SKATER';

// 'summary' = the Fan Pts / Z-Score column (the default sort); otherwise an individual stat.
export type SortColumn = StatKey | 'summary';
export type SortDirection = 'asc' | 'desc';

export interface ActiveColumns {
  scoring: Set<ScoringStatKey>;
  utility: Set<SkaterUtilityStatKey>;
}

export type SkaterScoringStats = Record<SkaterScoringStatKey, number>;
export type SkaterUtilityStats = Record<SkaterUtilityStatKey, number>;

export type StatWeights = Record<ScoringStatKey, number>;

interface BaseStats<S, U> {
  scoring: S;
  utility: U;
}

export type SkaterStats = BaseStats<SkaterScoringStats, SkaterUtilityStats>;

export type GoalieScoringStats = Record<GoalieScoringStatKey, number>;
export type GoalieUtilityStats = Record<GoalieUtilityStatKey, number>;

export type GoalieStats = BaseStats<GoalieScoringStats, GoalieUtilityStats>;

export interface PlayerScore {
  fantasyPoints: number;
  zScore: number;
}

interface BaseProjection {
  playerId: number;
}

export interface SkaterProjection extends BaseProjection {
  type: 'skater';
  stats: SkaterStats;
}

export interface GoalieProjection extends BaseProjection {
  type: 'goalie';
  stats: GoalieStats;
}

export type Projection = SkaterProjection | GoalieProjection;
