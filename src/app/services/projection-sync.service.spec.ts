import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectionSyncService, SyncedSettings } from './projection-sync.service';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { YahooSync } from '../api/models/yahoo-sync';

const settings: SyncedSettings = {
  scoringType: 'category',
  activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
  activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
  leagueSize: 12,
  rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
  statWeights: { goals: 5, assists: 3 } as Record<ScoringStatKey, number>,
};

describe('ProjectionSyncService', () => {
  let service: ProjectionSyncService;

  beforeEach(() => {
    service = new ProjectionSyncService();
  });

  it('produces an order-independent settings signature', () => {
    const reordered: SyncedSettings = {
      ...settings,
      activeScoringColumns: new Set<ScoringStatKey>(['assists', 'goals']),
    };

    expect(service.settingsSignature(settings)).toEqual(service.settingsSignature(reordered));
  });

  it('changes the signature when a synced setting changes', () => {
    const changed: SyncedSettings = { ...settings, leagueSize: 20 };

    expect(service.settingsSignature(settings)).not.toEqual(service.settingsSignature(changed));
  });

  it('reports divergence only when synced, baselined and changed', () => {
    const sync: YahooSync = { leagueName: 'HHL', leagueKey: 'nhl.l.1', syncedAt: 't' };

    expect(service.hasDiverged(null, 'a', 'a')).toEqual(false);
    expect(service.hasDiverged(sync, 'a', null)).toEqual(false);
    expect(service.hasDiverged(sync, 'a', 'a')).toEqual(false);
    expect(service.hasDiverged(sync, 'b', 'a')).toEqual(true);
  });
});
