import { computed, signal, Signal } from '@angular/core';
import { ProjectionState } from './projection-serializer';
import { YahooSync } from '../api/models/yahoo-sync';

/**
 * The settings that are copied from a Yahoo league on sync. Changing any of them is what
 * takes a projection out of sync with its league.
 */
type SyncedSettings = Pick<
  ProjectionState,
  | 'scoringType'
  | 'activeScoringColumns'
  | 'activeUtilityColumns'
  | 'leagueSize'
  | 'rosterSlots'
  | 'statWeights'
>;

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

/** A stable, order-independent string signature of the synced settings, for change detection. */
export function syncedSettingsSignature(settings: SyncedSettings): string {
  return JSON.stringify({
    scoringType: settings.scoringType,
    scoring: [...settings.activeScoringColumns].sort((a, b) => a.localeCompare(b)),
    utility: [...settings.activeUtilityColumns].sort((a, b) => a.localeCompare(b)),
    leagueSize: settings.leagueSize,
    rosterSlots: sortRecord(settings.rosterSlots as unknown as Record<string, number>),
    statWeights: sortRecord(settings.statWeights),
  });
}

export interface SyncGuard {
  /** True while the projection is synced but its synced settings have changed since the sync. */
  readonly diverged: Signal<boolean>;
  /** Snapshot the current settings as the in-sync baseline (call after a sync or on load). */
  markSynced(): void;
  /** Forget the baseline (call when the projection is no longer synced). */
  clear(): void;
}

export function createSyncGuard(
  yahooSync: Signal<YahooSync | null>,
  settingsKey: Signal<string>,
): SyncGuard {
  const snapshot = signal<string | null>(null);
  return {
    diverged: computed(
      () => yahooSync() != null && snapshot() != null && settingsKey() !== snapshot(),
    ),
    markSynced: () => snapshot.set(settingsKey()),
    clear: () => snapshot.set(null),
  };
}
