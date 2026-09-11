import { Injectable } from '@angular/core';
import { ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';
import { EspnSync } from '../api/models/espn-sync';
import { DEFAULT_STAT_WEIGHTS } from '../draft-projection/projection-defaults';

/**
 * Everything the Who's hot page remembers between visits: the span being looked at, how it is
 * scored, and which league it was synced from.
 *
 * Kept in localStorage rather than on the account. These settings describe how you like to
 * *look* at the league, not something you own — losing them on a new device costs one re-sync,
 * and storing them server-side would mean a table and an API for a preference.
 */
export interface WhosHotSettings {
  /**
   * The season the visitor picked, as the year it starts in, or null to follow the server's
   * default: the newest season with a game played.
   */
  season: number | null;
  fromGame: number;
  toGame: number;
  /** "The last N games" as a count the server resolves per team, or null for an explicit range. */
  lastGames: number | null;
  perGame: boolean;
  minGames: number;
  scoringType: ScoringType;
  statWeights: Record<ScoringStatKey, number>;
  activeScoringColumns: Set<ScoringStatKey>;
  activeUtilityColumns: Set<SkaterUtilityStatKey>;
  leagueSize: number;
  rosterSlots: RosterSlots;
  minGoalieGames: number;
  /** At most one of these is set: a leaderboard is scored by one league, on one platform. */
  yahooSync: YahooSync | null;
  espnSync: EspnSync | null;
  /** Survives an unsync: the stamp is the claim, this is the league they import from. */
  lastEspnLeagueId: string | null;
}

const STORAGE_KEY = 'slapstat.whosHot.settings';

/**
 * Bumped when what is stored stops meaning what it used to. Version 1 wrote every stat weight
 * out in full, which froze whatever the defaults were on the day of the visit: correcting a
 * default afterwards reached new visitors and nobody else. Those blobs are read for everything
 * except their weights, which are dropped in favour of the current defaults.
 *
 * Version 2 saved the season on every visit, picked or not, so a visit in the summer pinned
 * 2025-26 for good and the page never moved on to 2026-27 once it was underway. Its season is
 * dropped and the page follows the server's default until the visitor picks one.
 */
const SETTINGS_VERSION = 3;

/** The first version whose stat weights hold only what the visitor changed. */
const SPARSE_WEIGHTS_VERSION = 2;

/**
 * Sets don't survive JSON, so the two column sets travel as arrays — and the weights travel as
 * only the ones the user actually changed. Storing the whole table would mean a default this
 * page had never been told about could never reach anyone who had visited before.
 */
interface StoredSettings extends Omit<
  WhosHotSettings,
  'activeScoringColumns' | 'activeUtilityColumns' | 'statWeights'
> {
  version?: number;
  activeScoringColumns: ScoringStatKey[];
  activeUtilityColumns: SkaterUtilityStatKey[];
  statWeights: Partial<Record<ScoringStatKey, number>>;
}

@Injectable({
  providedIn: 'root',
})
export class WhosHotSettingsService {
  /**
   * Stored settings, or null when there are none — or when what is stored no longer parses.
   * A settings blob written by an older build is not worth failing the page over, so a bad
   * read falls back to the defaults and clears itself rather than throwing.
   */
  load(): WhosHotSettings | null {
    const raw = this.storage()?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      // `version` describes the blob rather than the settings, so it is read here and left
      // behind — the caller gets what they saved, not how it was stored.
      const { version, statWeights, ...stored } = JSON.parse(raw) as StoredSettings;
      const customised = (version ?? 1) >= SPARSE_WEIGHTS_VERSION ? (statWeights ?? {}) : {};
      return {
        ...stored,
        activeScoringColumns: new Set(stored.activeScoringColumns ?? []),
        activeUtilityColumns: new Set(stored.activeUtilityColumns ?? []),
        // Written by a build that only knew about Yahoo: absent is "no ESPN league", not
        // undefined, so callers get the same answer they would from a fresh visit.
        // Before version 3 a season was saved whether or not it had been picked.
        season: version === SETTINGS_VERSION ? (stored.season ?? null) : null,
        // Written before "the last N" was a count: the range stands as the bounds it saved.
        lastGames: stored.lastGames ?? null,
        espnSync: stored.espnSync ?? null,
        lastEspnLeagueId: stored.lastEspnLeagueId ?? null,
        // Defaults first, so a stat this page learns to score later arrives on its own.
        statWeights: { ...DEFAULT_STAT_WEIGHTS, ...customised },
      };
    } catch {
      this.clear();
      return null;
    }
  }

  save(settings: WhosHotSettings): void {
    const stored: StoredSettings = {
      ...settings,
      version: SETTINGS_VERSION,
      activeScoringColumns: [...settings.activeScoringColumns],
      activeUtilityColumns: [...settings.activeUtilityColumns],
      statWeights: changedWeights(settings.statWeights),
    };
    // A browser with storage disabled or full must not take the page down with it — the
    // settings are a convenience, and the page works perfectly well without remembering them.
    try {
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Nothing to recover: the next visit simply starts from the defaults.
    }
  }

  clear(): void {
    try {
      this.storage()?.removeItem(STORAGE_KEY);
    } catch {
      // Same as above — a storage that refuses to be cleared changes nothing for the user.
    }
  }

  private storage(): Storage | null {
    try {
      return localStorage;
    } catch {
      return null;
    }
  }
}

/** Only the weights that differ from the defaults; the rest are the defaults' to decide. */
function changedWeights(
  weights: Record<ScoringStatKey, number>,
): Partial<Record<ScoringStatKey, number>> {
  const changed: Partial<Record<ScoringStatKey, number>> = {};
  for (const [key, weight] of Object.entries(weights) as [ScoringStatKey, number][]) {
    if (weight !== DEFAULT_STAT_WEIGHTS[key]) {
      changed[key] = weight;
    }
  }
  return changed;
}
