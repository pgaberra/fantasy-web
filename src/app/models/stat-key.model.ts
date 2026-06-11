export const SKATER_UTILITY_STAT_KEYS = ['gp', 'toiPerGame'] as const;

export type SkaterUtilityStatKey = (typeof SKATER_UTILITY_STAT_KEYS)[number];

export const GOALIE_UTILITY_STAT_KEYS = ['gp'] as const;

export type GoalieUtilityStatKey = (typeof GOALIE_UTILITY_STAT_KEYS)[number];

export const UTILITY_STAT_KEYS = [
  ...new Set([...SKATER_UTILITY_STAT_KEYS, ...GOALIE_UTILITY_STAT_KEYS]),
] as const;

export type UtilityStatKey = (typeof UTILITY_STAT_KEYS)[number];

export const SKATER_SCORING_STAT_KEYS = [
  'goals',
  'assists',
  'plusMinus',
  'pim',
  'ppg',
  'ppa',
  'ppp',
  'shg',
  'sha',
  'shp',
  'gwg',
  'sog',
  'shPct',
  'fw',
  'fl',
  'hits',
  'blocks',
] as const;

export type SkaterScoringStatKey = (typeof SKATER_SCORING_STAT_KEYS)[number];

export const GOALIE_SCORING_STAT_KEYS = [
  'gs',
  'w',
  'l',
  'sho',
  'sa',
  'sv',
  'ga',
  'gaa',
  'svPct',
] as const;

export type GoalieScoringStatKey = (typeof GOALIE_SCORING_STAT_KEYS)[number];

export const SCORING_STAT_KEYS = [
  ...SKATER_SCORING_STAT_KEYS,
  ...GOALIE_SCORING_STAT_KEYS,
] as const;

export type ScoringStatKey = (typeof SCORING_STAT_KEYS)[number];

export const SKATER_STAT_KEYS = [...SKATER_UTILITY_STAT_KEYS, ...SKATER_SCORING_STAT_KEYS] as const;

export type SkaterStatKey = (typeof SKATER_STAT_KEYS)[number];

export const GOALIE_STAT_KEYS = [...GOALIE_UTILITY_STAT_KEYS, ...GOALIE_SCORING_STAT_KEYS] as const;

export type GoalieStatKey = (typeof GOALIE_STAT_KEYS)[number];

export type StatKey = UtilityStatKey | ScoringStatKey;
