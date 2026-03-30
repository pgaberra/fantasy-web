import { Injectable } from '@angular/core';
import { StatKey } from '../models/stat-key.model';

const PERCENTAGE_STAT_KEYS = ['shPct', 'svPct'] as const;
type PercentageStatKey = (typeof PERCENTAGE_STAT_KEYS)[number];

const RATE_STAT_KEYS = ['shPct', 'svPct', 'gaa'] as const;
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

  isToiStat(key: StatKey): boolean {
    return key === 'toiPerGame';
  }

  canStatBeNegative(key: StatKey): boolean {
    return key === 'plusMinus';
  }
}
