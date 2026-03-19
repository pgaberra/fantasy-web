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

export type DecimalStatKey = ScoringStatKey | 'gp';

export const DEFAULT_DECIMAL_SETTINGS: Record<DecimalStatKey, number> = {
  gp: 0,
  goals: 0,
  assists: 0,
  plusMinus: 0,
  pim: 0,
  ppg: 0,
  ppa: 0,
  shg: 0,
  sha: 0,
  gwg: 0,
  sog: 0,
  shPct: 1,
  fw: 0,
  fl: 0,
  hits: 0,
  blocks: 0,
};
