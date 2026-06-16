import { ScoringStatKey, SkaterUtilityStatKey, SCORING_STAT_KEYS } from '../models/stat-key.model';
import { ScaleConfig } from './projection-settings-section/model';
import { RosterSlots } from '../api/models/roster-slots';

export const DEFAULT_STAT_WEIGHTS: Record<ScoringStatKey, number> = {
  goals: 4.5,
  assists: 3,
  points: 0,
  sog: 0.5,
  hits: 0.33,
  blocks: 0.5,
  gwg: 0.5,
  pim: 0.5,
  ppg: 0.5,
  ppa: 0.5,
  ppp: 0,
  shg: 0.5,
  sha: 0.5,
  shp: 0,
  shPct: 0.5,
  fw: 0.5,
  fl: 0.5,
  plusMinus: 0.5,
  gs: 0,
  w: 4,
  l: 0,
  sho: 3,
  sa: 0,
  sv: 0.2,
  ga: -1,
  gaa: 0,
  svPct: 0,
};

export const DEFAULT_SCORING_COLUMNS: ScoringStatKey[] = [
  'goals',
  'assists',
  'sog',
  'hits',
  'blocks',
  'gaa',
  'svPct',
  'w',
];

export const DEFAULT_UTILITY_COLUMNS: SkaterUtilityStatKey[] = ['gp'];

export const DEFAULT_LEAGUE_SIZE = 12;

export const DEFAULT_ROSTER_SLOTS: RosterSlots = {
  c: 2,
  lw: 2,
  rw: 2,
  d: 4,
  util: 0,
  bn: 4,
  g: 2,
};

export function createDefaultScaleSettings(
  isRateStat: (key: ScoringStatKey) => boolean,
): Record<SkaterUtilityStatKey, ScaleConfig> {
  const scalableStats = new Set<ScoringStatKey>(SCORING_STAT_KEYS.filter((k) => !isRateStat(k)));
  return {
    gp: { scale: true, scalableStats },
    toiPerGame: { scale: true, scalableStats },
  };
}
