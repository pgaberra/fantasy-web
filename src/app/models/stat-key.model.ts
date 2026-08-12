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
  'points',
  'plusMinus',
  'pim',
  'ppg',
  'ppa',
  'ppp',
  'shg',
  'sha',
  'shp',
  'stpg',
  'stpa',
  'stp',
  'gwg',
  'hatTricks',
  'sog',
  'shPct',
  'fw',
  'fl',
  'hits',
  'blocks',
  'defPoints',
  'shifts',
  'toi',
] as const;

export type SkaterScoringStatKey = (typeof SKATER_SCORING_STAT_KEYS)[number];

export const GOALIE_SCORING_STAT_KEYS = [
  'gs',
  'w',
  'l',
  'otl',
  'sho',
  'sa',
  'sv',
  'ga',
  'gaa',
  'svPct',
  'winPct',
  'toi',
] as const;

export type GoalieScoringStatKey = (typeof GOALIE_SCORING_STAT_KEYS)[number];

// Time on ice is scored for skaters and goalies alike, so it appears in both lists — the
// same reason gp does among the utility keys, and deduped the same way.
export const SCORING_STAT_KEYS = [
  ...new Set([...SKATER_SCORING_STAT_KEYS, ...GOALIE_SCORING_STAT_KEYS]),
] as const;

export type ScoringStatKey = (typeof SCORING_STAT_KEYS)[number];

export const LOWER_IS_BETTER_SCORING_STAT_KEYS: ReadonlySet<ScoringStatKey> = new Set([
  'ga',
  'gaa',
  'l',
]);

// Rate stats describe a per-unit share, so scaling them by games played would be wrong — and,
// unlike a running total, a low one is low on its own merits rather than because the player
// barely played.
export const RATE_STAT_KEYS = ['shPct', 'svPct', 'winPct', 'gaa'] as const;
export type RateStatKey = (typeof RATE_STAT_KEYS)[number];

export const SKATER_STAT_KEYS = [...SKATER_UTILITY_STAT_KEYS, ...SKATER_SCORING_STAT_KEYS] as const;

export type SkaterStatKey = (typeof SKATER_STAT_KEYS)[number];

export const GOALIE_STAT_KEYS = [...GOALIE_UTILITY_STAT_KEYS, ...GOALIE_SCORING_STAT_KEYS] as const;

export type GoalieStatKey = (typeof GOALIE_STAT_KEYS)[number];

export type StatKey = UtilityStatKey | ScoringStatKey;
