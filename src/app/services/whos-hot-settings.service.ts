import { Injectable } from '@angular/core';
import { ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';

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

/** Sets don't survive JSON, so the two column sets travel as arrays. */
interface StoredSettings extends Omit<
  WhosHotSettings,
  'activeScoringColumns' | 'activeUtilityColumns'
> {
  activeScoringColumns: ScoringStatKey[];
  activeUtilityColumns: SkaterUtilityStatKey[];
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
      const stored = JSON.parse(raw) as StoredSettings;
      return {
        ...stored,
        activeScoringColumns: new Set(stored.activeScoringColumns ?? []),
        activeUtilityColumns: new Set(stored.activeUtilityColumns ?? []),
      };
    } catch {
      this.clear();
      return null;
    }
  }

  save(settings: WhosHotSettings): void {
    const stored: StoredSettings = {
      ...settings,
      activeScoringColumns: [...settings.activeScoringColumns],
      activeUtilityColumns: [...settings.activeUtilityColumns],
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
