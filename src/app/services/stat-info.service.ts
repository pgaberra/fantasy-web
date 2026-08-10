import { Injectable } from '@angular/core';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  SkaterUtilityStatKey,
  StatKey,
} from '../models/stat-key.model';

const PERCENTAGE_STAT_KEYS = ['shPct', 'svPct', 'winPct'] as const;
type PercentageStatKey = (typeof PERCENTAGE_STAT_KEYS)[number];

// Rate stats describe a per-unit share, so scaling them by games played would be wrong.
const RATE_STAT_KEYS = ['shPct', 'svPct', 'winPct', 'gaa'] as const;
type RateStatKey = (typeof RATE_STAT_KEYS)[number];

@Injectable({
  providedIn: 'root',
})
export class StatInfoService {
  isPercentageStat(key: StatKey): key is PercentageStatKey {
    return (PERCENTAGE_STAT_KEYS as readonly string[]).includes(key);
  }

  isRateStat(key: StatKey): key is RateStatKey {
    return (RATE_STAT_KEYS as readonly string[]).includes(key);
  }

  /** Time on ice is held in seconds and shown as MM:SS, per game and for the season alike. */
  isToiStat(key: StatKey): boolean {
    return key === 'toiPerGame' || key === 'toi';
  }

  canStatBeNegative(key: StatKey): boolean {
    return key === 'plusMinus';
  }

  isGoalieScoringStat(key: ScoringStatKey): boolean {
    return (GOALIE_SCORING_STAT_KEYS as readonly string[]).includes(key);
  }

  isSkaterScoringStat(key: ScoringStatKey): boolean {
    return (SKATER_SCORING_STAT_KEYS as readonly string[]).includes(key);
  }

  isGoalieUtilityStat(key: SkaterUtilityStatKey): boolean {
    return (GOALIE_UTILITY_STAT_KEYS as readonly string[]).includes(key);
  }

  isSkaterUtilityStat(key: SkaterUtilityStatKey): boolean {
    return (SKATER_UTILITY_STAT_KEYS as readonly string[]).includes(key);
  }
}
