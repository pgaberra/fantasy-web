import { Injectable } from '@angular/core';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SKATER_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  SkaterUtilityStatKey,
  RATE_STAT_KEYS,
  RateStatKey,
  StatKey,
} from '../models/stat-key.model';
import { Player } from '../models/player.model';

const PERCENTAGE_STAT_KEYS = ['shPct', 'svPct', 'winPct'] as const;
type PercentageStatKey = (typeof PERCENTAGE_STAT_KEYS)[number];

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

  /**
   * Whether this player can have this stat at all.
   *
   * The distinction a table has to make is between a stat someone scored none of and a stat
   * that isn't theirs to score. A skater's save percentage is not zero — it does not exist,
   * and a column of zeroes claims otherwise. Defencemen points work the same way: the
   * category counts points scored while eligible at defence, so a forward doesn't have a
   * small number of them.
   */
  isStatApplicable(key: StatKey, player: Player): boolean {
    if (player.type === 'goalie') {
      return (GOALIE_STAT_KEYS as readonly string[]).includes(key);
    }
    if (!(SKATER_STAT_KEYS as readonly string[]).includes(key)) {
      return false;
    }
    return key !== 'defPoints' || player.positions.has('D');
  }
}
