import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WhosHotSettings, WhosHotSettingsService } from './whos-hot-settings.service';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';

const settings: WhosHotSettings = {
  fromGame: 50,
  toGame: 82,
  perGame: true,
  minGames: 5,
  scoringType: 'category',
  statWeights: { goals: 5, assists: 3 } as Record<ScoringStatKey, number>,
  activeScoringColumns: new Set<ScoringStatKey>(['goals', 'hits']),
  activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
  leagueSize: 12,
  rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
  minGoalieGames: 30,
  yahooSync: { leagueName: 'HHL', leagueKey: 'nhl.l.1', syncedAt: 't' },
};

describe('WhosHotSettingsService', () => {
  let service: WhosHotSettingsService;

  beforeEach(() => {
    service = new WhosHotSettingsService();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reports nothing stored before anything is saved', () => {
    expect(service.load()).toEqual(null);
  });

  it('round-trips settings, restoring the column sets as sets', () => {
    service.save(settings);

    const loaded = service.load();

    expect(loaded).toEqual(settings);
    expect(loaded?.activeScoringColumns.has('hits')).toEqual(true);
    expect(loaded?.activeUtilityColumns).toBeInstanceOf(Set);
  });

  it('falls back to no settings when what is stored no longer parses', () => {
    localStorage.setItem('slapstat.whosHot.settings', '{not json');

    expect(service.load()).toEqual(null);
    // The unreadable blob is cleared, so it can't fail every subsequent visit too.
    expect(localStorage.getItem('slapstat.whosHot.settings')).toEqual(null);
  });

  it('treats a blob missing its column arrays as having no columns rather than throwing', () => {
    localStorage.setItem('slapstat.whosHot.settings', JSON.stringify({ fromGame: 1, toGame: 82 }));

    expect(service.load()?.activeScoringColumns.size).toEqual(0);
  });

  it('survives a storage that refuses to be written to', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => service.save(settings)).not.toThrow();
  });

  it('clears stored settings', () => {
    service.save(settings);

    service.clear();

    expect(service.load()).toEqual(null);
  });
});
