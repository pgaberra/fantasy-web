import { ScoringStatKey, UtilityStatKey } from '../models/player.model';

export type ScoringType = 'category' | 'points';

export interface ActiveColumns {
  scoringColumns: Set<ScoringStatKey>;
  utilityColumns: Set<UtilityStatKey>;
}

export interface ProjectedStats {
  scoring: Record<ScoringStatKey, number>;
  utility: Record<UtilityStatKey, number>;
}

export interface PlayerScore {
  fantasyPoints: number;
  zScore: number;
}

export interface PlayerProjection {
  playerId: number;
  stats: ProjectedStats;
}
