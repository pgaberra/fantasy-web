import { Injectable } from '@angular/core';
import { ProjectionState } from './projection-serializer';
import { YahooSync } from '../api/models/yahoo-sync';
import { EspnSync } from '../api/models/espn-sync';

/**
 * The settings copied from a league on sync, whichever platform it was. Changing any of them is
 * what takes a projection out of sync with that league.
 */
export type SyncedSettings = Pick<
  ProjectionState,
  | 'scoringType'
  | 'activeScoringColumns'
  | 'activeUtilityColumns'
  | 'leagueSize'
  | 'rosterSlots'
  | 'statWeights'
>;

@Injectable({ providedIn: 'root' })
export class ProjectionSyncService {
  /** A stable, order-independent signature of the synced settings, for change detection. */
  settingsSignature(settings: SyncedSettings): string {
    return JSON.stringify({
      scoringType: settings.scoringType,
      scoring: [...settings.activeScoringColumns].sort((a, b) => a.localeCompare(b)),
      utility: [...settings.activeUtilityColumns].sort((a, b) => a.localeCompare(b)),
      leagueSize: settings.leagueSize,
      rosterSlots: this.byKey(Object.entries(settings.rosterSlots)),
      statWeights: this.byKey(Object.entries(settings.statWeights)),
    });
  }

  /**
   * Whether a synced projection's settings have changed since the baseline snapshot taken
   * when it was last synced (or loaded). Not synced or no baseline means not diverged.
   */
  hasDiverged(
    sync: YahooSync | EspnSync | null,
    currentSignature: string,
    baseline: string | null,
  ): boolean {
    return sync != null && baseline != null && currentSignature !== baseline;
  }

  private byKey(entries: [string, unknown][]): [string, unknown][] {
    return entries.sort(([a], [b]) => a.localeCompare(b));
  }
}
