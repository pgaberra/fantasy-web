import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { createSyncGuard, syncedSettingsSignature } from './projection-sync';
import { YahooSync } from '../api/models/yahoo-sync';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { ProjectionState } from './projection-serializer';

type SyncedSettings = Pick<
  ProjectionState,
  | 'scoringType'
  | 'activeScoringColumns'
  | 'activeUtilityColumns'
  | 'leagueSize'
  | 'rosterSlots'
  | 'statWeights'
>;

const settings: SyncedSettings = {
  scoringType: 'category',
  activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
  activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
  leagueSize: 12,
  rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
  statWeights: { goals: 5, assists: 3 } as Record<ScoringStatKey, number>,
};

describe('projection-sync', () => {
  it('produces an order-independent settings signature', () => {
    const reordered: SyncedSettings = {
      ...settings,
      activeScoringColumns: new Set<ScoringStatKey>(['assists', 'goals']),
    };

    expect(syncedSettingsSignature(settings)).toEqual(syncedSettingsSignature(reordered));
  });

  it('changes the signature when a synced setting changes', () => {
    const changed: SyncedSettings = { ...settings, leagueSize: 20 };

    expect(syncedSettingsSignature(settings)).not.toEqual(syncedSettingsSignature(changed));
  });

  it('diverges only after a synced setting changes while synced', () => {
    const yahooSync = signal<YahooSync | null>(null);
    const settingsKey = signal('a');
    const guard = createSyncGuard(yahooSync, settingsKey);

    expect(guard.diverged()).toEqual(false);

    yahooSync.set({ leagueName: 'HHL', leagueKey: 'nhl.l.1', syncedAt: '2026-06-20T00:00:00Z' });
    guard.markSynced();
    expect(guard.diverged()).toEqual(false);

    settingsKey.set('b');
    expect(guard.diverged()).toEqual(true);

    guard.clear();
    expect(guard.diverged()).toEqual(false);
  });
});
