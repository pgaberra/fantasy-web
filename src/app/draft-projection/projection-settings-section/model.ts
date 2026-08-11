import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  UtilityStatKey,
} from '../../models/stat-key.model';

export interface ScaleConfig {
  scale: boolean;
  scalableStats: Set<ScoringStatKey>;
}

/**
 * Which of the active scoring stats a utility stat may scale. Rate stats are excluded (scaling
 * SH% with games played is meaningless), and a skater-only utility stat can only reach skater
 * scoring stats — GP belongs to both, so it reaches everything.
 *
 * Shared by the settings panel and the column menu that replaces it on the projection page.
 */
export function scalableScoringStatsFor(
  utilityKey: UtilityStatKey,
  activeScoringColumnsSorted: readonly ScoringStatKey[],
  isRateStat: (statKey: ScoringStatKey) => boolean,
): ScoringStatKey[] {
  const scalable = activeScoringColumnsSorted.filter((statKey) => !isRateStat(statKey));
  const isGoalieUtility = (GOALIE_UTILITY_STAT_KEYS as readonly string[]).includes(utilityKey);
  const isSkaterUtility = (SKATER_UTILITY_STAT_KEYS as readonly string[]).includes(utilityKey);

  if (isGoalieUtility && isSkaterUtility) {
    return scalable;
  }
  if (isGoalieUtility) {
    return scalable.filter((statKey) =>
      (GOALIE_SCORING_STAT_KEYS as readonly string[]).includes(statKey),
    );
  }
  return scalable.filter((statKey) =>
    (SKATER_SCORING_STAT_KEYS as readonly string[]).includes(statKey),
  );
}

export type DecimalStatKey = ScoringStatKey | 'gp';

export const DEFAULT_DECIMAL_SETTINGS: Record<DecimalStatKey, number> = {
  gp: 0,
  goals: 0,
  assists: 0,
  points: 0,
  plusMinus: 0,
  pim: 0,
  ppg: 0,
  ppa: 0,
  ppp: 0,
  shg: 0,
  sha: 0,
  shp: 0,
  stpg: 0,
  stpa: 0,
  stp: 0,
  gwg: 0,
  hatTricks: 0,
  sog: 0,
  shPct: 1,
  fw: 0,
  fl: 0,
  hits: 0,
  blocks: 0,
  defPoints: 0,
  shifts: 0,
  toi: 0,
  gs: 0,
  w: 0,
  l: 0,
  otl: 0,
  sho: 0,
  sa: 0,
  sv: 0,
  ga: 0,
  gaa: 2,
  svPct: 3,
  winPct: 3,
};
