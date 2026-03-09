import { ScoringStatKey, UtilityStatKey } from '../models/player.model';

export type ScoringType = 'category' | 'points';

export interface ProjectedStats {
  scoring: Record<ScoringStatKey, number>;
  utility: Record<UtilityStatKey, number>;
}

export type PlayerProjection = {
  playerId: number;
  stats: ProjectedStats;
  fantasyPoints: number;
  zScore: number;
}

export interface Projection {
  scoringType: ScoringType;
  playerProjections: PlayerProjection[];
  statWeights: Record<ScoringStatKey, number>;
}
