import { ScoringStatKey } from '../../models/stat-key.model';

export interface ScaleConfig {
  scale: boolean;
  scalableStats: Set<ScoringStatKey>;
}

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
  gs: 0,
  w: 0,
  l: 0,
  sho: 0,
  sa: 0,
  sv: 0,
  ga: 0,
  gaa: 2,
  svPct: 3,
};
