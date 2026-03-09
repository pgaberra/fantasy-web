export type Position = 'LW' | 'C' | 'RW' | 'D';

export const UTILITY_STAT_KEYS = [
  'gp',
  'toiPerGame'
] as const;

export type UtilityStatKey = (typeof UTILITY_STAT_KEYS)[number];

export const SCORING_STAT_KEYS = [
  'goals',
  'assists',
  'plusMinus',
  'pim',
  'ppg',
  'ppa',
  'shg',
  'sha',
  'gwg',
  'sog',
  'shPct',
  'fw',
  'fl',
  'hits',
  'blocks'
] as const;

export type ScoringStatKey = (typeof SCORING_STAT_KEYS)[number];

export type StatKey = ScoringStatKey | UtilityStatKey;

export interface Player {
  id: number;
  name: string;
  positions: Set<Position>;
  stats: {
    scoring: Record<ScoringStatKey, number>;
    utility: Record<UtilityStatKey, number>;
  };
}
