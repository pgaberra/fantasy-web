import { SCORING_STAT_KEYS, ScoringStatKey, UtilityStatKey } from '../../models/player.model';

export interface ScaleConfig {
  scale: boolean;
  scalableStats: Set<ScoringStatKey>;
}

const DEFAULT_SCALABLE_STATS = new Set(SCORING_STAT_KEYS.filter((k) => k !== 'shPct'));

export const DEFAULT_SCALE_SETTINGS: Record<UtilityStatKey, ScaleConfig> = {
  gp: { scale: true, scalableStats: DEFAULT_SCALABLE_STATS },
  toiPerGame: { scale: true, scalableStats: DEFAULT_SCALABLE_STATS },
};
