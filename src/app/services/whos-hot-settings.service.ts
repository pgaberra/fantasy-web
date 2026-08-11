import { Injectable } from '@angular/core';
import { ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';
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
  fromGame: number;
  toGame: number;
  perGame: boolean;
  minGames: number;
  scoringType: ScoringType;
  statWeights: Record<ScoringStatKey, number>;
  activeScoringColumns: Set<ScoringStatKey>;
  activeUtilityColumns: Set<SkaterUtilityStatKey>;
  leagueSize: number;
  rosterSlots: RosterSlots;
  minGoalieGames: number;
  yahooSync: YahooSync | null;
}

const STORAGE_KEY = 'slapstat.whosHot.settings';

/**
 * Bumped when what is stored stops meaning what it used to. Version 1 wrote every stat weight
 * out in full, which froze whatever the defaults were on the day of the visit: correcting a
 * default afterwards reached new visitors and nobody else. Those blobs are read for everything
 * except their weights, which are dropped in favour of the current defaults.
 */
const SETTINGS_VERSION = 2;

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
      const customised = version === SETTINGS_VERSION ? (statWeights ?? {}) : {};
      return {
        ...stored,
        activeScoringColumns: new Set(stored.activeScoringColumns ?? []),
        activeUtilityColumns: new Set(stored.activeUtilityColumns ?? []),
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
