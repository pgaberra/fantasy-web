import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WhosHotSettings, WhosHotSettingsService } from './whos-hot-settings.service';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { DEFAULT_STAT_WEIGHTS } from '../draft-projection/projection-defaults';

const settings: WhosHotSettings = {
  fromGame: 50,
  toGame: 82,
  perGame: true,
  minGames: 5,
  scoringType: 'category',
  statWeights: { ...DEFAULT_STAT_WEIGHTS, goals: 9 },
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

  describe('stat weights', () => {
    const STORAGE_KEY = 'slapstat.whosHot.settings';

    it('keeps a weight the visitor actually changed', () => {
      service.save(settings);

      expect(service.load()?.statWeights.goals).toEqual(9);
    });

    it('stores only what differs from the defaults', () => {
      service.save(settings);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
        statWeights: Record<string, number>;
      };

      // Everything else is the defaults' to decide, and writing it down is what froze them.
      expect(stored.statWeights).toEqual({ goals: 9 });
    });

    it('lets a corrected default reach someone who has already been here', () => {
      // What version 1 wrote: every weight in full, including the zeros the ESPN-only
      // categories had before they were given one.
      const zeroed = Object.fromEntries(Object.keys(DEFAULT_STAT_WEIGHTS).map((key) => [key, 0]));
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...settings,
          statWeights: zeroed,
          activeScoringColumns: [],
          activeUtilityColumns: [],
        }),
      );

      const loaded = service.load();

      expect(loaded?.statWeights.hatTricks).toEqual(DEFAULT_STAT_WEIGHTS.hatTricks);
      expect(loaded?.statWeights.stp).toEqual(DEFAULT_STAT_WEIGHTS.stp);
      // The rest of that blob is still theirs — only the weights were rewritten.
      expect(loaded?.fromGame).toEqual(50);
      expect(loaded?.perGame).toEqual(true);
    });

    it('fills in a stat the stored blob has never heard of', () => {
      service.save({ ...settings, statWeights: { ...DEFAULT_STAT_WEIGHTS, goals: 9 } });

      expect(service.load()?.statWeights.shifts).toEqual(DEFAULT_STAT_WEIGHTS.shifts);
      expect(Object.keys(service.load()!.statWeights).sort((a, b) => a.localeCompare(b))).toEqual(
        Object.keys(DEFAULT_STAT_WEIGHTS).sort((a, b) => a.localeCompare(b)),
      );
    });
  });
});
