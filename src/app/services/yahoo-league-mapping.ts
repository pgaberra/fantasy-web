import {
  ScoringStatKey,
  SCORING_STAT_KEYS,
  UtilityStatKey,
  UTILITY_STAT_KEYS,
} from '../models/stat-key.model';
import { RosterSlots } from '../api/models/roster-slots';
import { LeagueSettingsResponse } from '../api/models/league-settings-response';
import { RosterSlot } from '../api/models/roster-slot';

export type SyncableScoringType = 'points' | 'category';

/**
 * Yahoo NHL stat_id -> projection stat key. Verified against Yahoo's live NHL stat
 * catalog. Ids with no projection equivalent (13 GTG, 21 ties, 28/33 total TOI) are
 * intentionally absent and surfaced as "unsupported" during a sync.
 */
const YAHOO_STAT_ID_TO_KEY: Record<number, ScoringStatKey | UtilityStatKey> = {
  0: 'gp',
  29: 'gp',
  30: 'gp',
  1: 'goals',
  2: 'assists',
  3: 'points',
  4: 'plusMinus',
  5: 'pim',
  6: 'ppg',
  7: 'ppa',
  8: 'ppp',
  9: 'shg',
  10: 'sha',
  11: 'shp',
  12: 'gwg',
  14: 'sog',
  15: 'shPct',
  16: 'fw',
  17: 'fl',
  18: 'gs',
  19: 'w',
  20: 'l',
  22: 'ga',
  23: 'gaa',
  24: 'sa',
  25: 'sv',
  26: 'svPct',
  27: 'sho',
  31: 'hits',
  32: 'blocks',
  34: 'toiPerGame',
};

/** Yahoo roster position code -> projection RosterSlots bucket. */
const YAHOO_POSITION_TO_SLOT: Record<string, keyof RosterSlots> = {
  C: 'c',
  LW: 'lw',
  RW: 'rw',
  D: 'd',
  G: 'g',
  BN: 'bn',
  UTIL: 'util',
  // Flex/combined slots the projection model lacks -> the any-skater util bucket.
  W: 'util',
  F: 'util',
};

/** Non-active Yahoo slots that don't belong in a draft roster. */
const IGNORED_POSITION_CODES = new Set(['IR', 'IR+', 'IR-LT', 'NA']);

const UTILITY_KEYS = new Set<string>(UTILITY_STAT_KEYS);

export interface MappedLeagueSettings {
  scoringType: SyncableScoringType;
  activeScoringColumns: ScoringStatKey[];
  activeUtilityColumns: UtilityStatKey[];
  /** Points leagues only: full weight set (scored stats -> point value, others -> 0). Null for category. */
  statWeights: Record<ScoringStatKey, number> | null;
  rosterSlots: RosterSlots;
  /** From the picked league's numTeams; null when unknown (leave the projection's value). */
  leagueSize: number | null;
}

export interface LeagueSyncResult {
  /** Null when the league can't be synced yet (head-to-head). */
  mapped: MappedLeagueSettings | null;
  headToHead: boolean;
  /** Yahoo scoring categories with no projection equivalent (e.g. GTG). */
  unsupportedStats: string[];
  /** Yahoo roster codes dropped or approximated (e.g. IR, W). */
  unsupportedRosterCodes: string[];
}

function mapScoringType(yahoo: string): SyncableScoringType | null {
  if (yahoo === 'points') {
    return 'points';
  }
  if (yahoo === 'category') {
    return 'category';
  }
  return null;
}

function emptyRoster(): RosterSlots {
  return { c: 0, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 };
}

function mapRoster(positions: RosterSlot[]): { rosterSlots: RosterSlots; unsupported: string[] } {
  const rosterSlots = emptyRoster();
  const unsupported: string[] = [];
  for (const slot of positions) {
    const code = (slot.position ?? '').toUpperCase();
    if (IGNORED_POSITION_CODES.has(code)) {
      unsupported.push(slot.position);
      continue;
    }
    const bucket = YAHOO_POSITION_TO_SLOT[code];
    if (bucket) {
      rosterSlots[bucket] += slot.count;
      if (code === 'W' || code === 'F') {
        unsupported.push(slot.position);
      }
    } else {
      rosterSlots.util += slot.count;
      unsupported.push(slot.position);
    }
  }
  return { rosterSlots, unsupported };
}

function buildWeights(scored: Record<string, number>): Record<ScoringStatKey, number> {
  const weights = {} as Record<ScoringStatKey, number>;
  for (const key of SCORING_STAT_KEYS) {
    weights[key] = scored[key] ?? 0;
  }
  return weights;
}

function clampLeagueSize(numTeams: number | undefined): number | null {
  if (typeof numTeams !== 'number' || !Number.isFinite(numTeams)) {
    return null;
  }
  return Math.min(30, Math.max(2, Math.round(numTeams)));
}

/**
 * Translate a Yahoo league's settings into projection settings (replace semantics).
 * Head-to-head leagues are not supported yet (mapped = null, headToHead = true).
 */
export function mapLeagueSettings(
  settings: LeagueSettingsResponse,
  numTeams?: number,
): LeagueSyncResult {
  const scoringType = mapScoringType(settings.scoringType);
  if (scoringType === null) {
    return {
      mapped: null,
      headToHead: settings.scoringType === 'head',
      unsupportedStats: [],
      unsupportedRosterCodes: [],
    };
  }

  const activeScoringColumns: ScoringStatKey[] = [];
  const activeUtilityColumns: UtilityStatKey[] = [];
  const unsupportedStats: string[] = [];
  const scoredWeights: Record<string, number> = {};

  for (const category of settings.statCategories) {
    const key = YAHOO_STAT_ID_TO_KEY[category.statId];
    if (!key) {
      unsupportedStats.push(category.displayName || category.name);
      continue;
    }
    if (UTILITY_KEYS.has(key)) {
      if (!activeUtilityColumns.includes(key as UtilityStatKey)) {
        activeUtilityColumns.push(key as UtilityStatKey);
      }
      continue;
    }
    if (!activeScoringColumns.includes(key as ScoringStatKey)) {
      activeScoringColumns.push(key as ScoringStatKey);
    }
    if (scoringType === 'points' && typeof category.pointValue === 'number') {
      scoredWeights[key] = category.pointValue;
    }
  }

  // gp is the universal context column; always keep it shown.
  if (!activeUtilityColumns.includes('gp')) {
    activeUtilityColumns.unshift('gp');
  }

  const { rosterSlots, unsupported } = mapRoster(settings.rosterPositions);

  return {
    mapped: {
      scoringType,
      activeScoringColumns,
      activeUtilityColumns,
      statWeights: scoringType === 'points' ? buildWeights(scoredWeights) : null,
      rosterSlots,
      leagueSize: clampLeagueSize(numTeams),
    },
    headToHead: false,
    unsupportedStats,
    unsupportedRosterCodes: unsupported,
  };
}
