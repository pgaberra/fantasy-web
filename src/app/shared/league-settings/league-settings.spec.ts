import { describe, it, expect } from 'vitest';
import {
  LeagueSettings,
  NO_PAGE_LEAGUES,
  pageLeagueFor,
  withEspnImport,
  withPageLeague,
  withYahooImport,
} from './league-settings';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_STAT_WEIGHTS,
} from '../../draft-projection/projection-defaults';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';

describe('league settings imports', () => {
  const SYNCED_AT = '2026-09-17T08:00:00.000Z';

  const current: LeagueSettings = {
    scoringType: 'points',
    statWeights: DEFAULT_STAT_WEIGHTS,
    activeScoringColumns: new Set(['goals', 'assists']),
    activeUtilityColumns: new Set(['gp']),
    leagueSize: DEFAULT_LEAGUE_SIZE,
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    minGoalieGames: 30,
    yahooSync: null,
    espnSync: { leagueName: 'Old ESPN league', leagueId: '1', syncedAt: SYNCED_AT },
    lastEspnLeagueId: '1',
  };

  const imported = (
    change: Partial<LeagueProjectionSettingsResponse> = {},
  ): LeagueProjectionSettingsResponse => ({
    scoringType: 'category',
    activeScoringColumns: ['goals', 'hits'],
    activeUtilityColumns: [],
    rosterSlots: { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 3, g: 1 },
    unsupportedRosterCodes: [],
    unsupportedStats: [],
    ...change,
  });

  it('takes the scoring, the stats and the roster from the league', () => {
    const next = withYahooImport(
      current,
      { settings: imported({ leagueSize: 10 }), leagueName: 'HHL', leagueKey: 'nhl.l.1' },
      SYNCED_AT,
    );

    expect(next.scoringType).toEqual('category');
    expect([...next.activeScoringColumns]).toEqual(['goals', 'hits']);
    expect([...next.activeUtilityColumns]).toEqual([]);
    expect(next.rosterSlots.c).toEqual(1);
    expect(next.leagueSize).toEqual(10);
  });

  // A category league reports no weights and a league may not report its size; neither wipes
  // what was there, so switching back to points still has the weights someone set.
  it('keeps the weights and the size a league does not report', () => {
    const next = withYahooImport(
      current,
      { settings: imported(), leagueName: 'HHL', leagueKey: 'nhl.l.1' },
      SYNCED_AT,
    );

    expect(next.statWeights).toBe(DEFAULT_STAT_WEIGHTS);
    expect(next.leagueSize).toEqual(DEFAULT_LEAGUE_SIZE);
  });

  it('stamps a Yahoo import as Yahoo and drops the ESPN stamp', () => {
    const next = withYahooImport(
      current,
      { settings: imported(), leagueName: 'HHL', leagueKey: 'nhl.l.1' },
      SYNCED_AT,
    );

    expect(next.yahooSync).toEqual({
      leagueName: 'HHL',
      leagueKey: 'nhl.l.1',
      syncedAt: SYNCED_AT,
    });
    expect(next.espnSync).toBeNull();
    // Where ESPN imports start from next time is kept: that league is still the user's.
    expect(next.lastEspnLeagueId).toEqual('1');
  });

  it('stamps an ESPN import as ESPN, named by the id when ESPN gives no name', () => {
    const next = withEspnImport(
      { ...current, yahooSync: { leagueName: 'HHL', leagueKey: 'nhl.l.1', syncedAt: SYNCED_AT } },
      {
        settings: imported({ scoringType: 'points', statWeights: { goals: 6, hits: 1 } }),
        leagueId: '42',
      },
      SYNCED_AT,
    );

    expect(next.espnSync).toEqual({ leagueName: '42', leagueId: '42', syncedAt: SYNCED_AT });
    expect(next.lastEspnLeagueId).toEqual('42');
    expect(next.yahooSync).toBeNull();
    expect(next.statWeights).toEqual({ goals: 6, hits: 1 });
  });
});

describe('leagues set on a page', () => {
  const base: LeagueSettings = {
    scoringType: 'points',
    statWeights: DEFAULT_STAT_WEIGHTS,
    activeScoringColumns: new Set(['goals']),
    activeUtilityColumns: new Set(['gp']),
    leagueSize: DEFAULT_LEAGUE_SIZE,
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    minGoalieGames: 30,
    yahooSync: null,
    espnSync: null,
    lastEspnLeagueId: null,
  };
  const board: LeagueSettings = { ...base, scoringType: 'category', minGoalieGames: 20 };
  const synced = (syncedAt: string): LeagueSettings => ({
    ...base,
    leagueSize: 10,
    yahooSync: { leagueName: 'Mine', leagueKey: '465.l.1', syncedAt },
  });

  it('keeps a hand edit to what it was made for', () => {
    const leagues = withPageLeague(NO_PAGE_LEAGUES, 'preset', base, { ...base, leagueSize: 14 });

    expect(pageLeagueFor(leagues, 'preset', base)?.leagueSize).toEqual(14);
    expect(pageLeagueFor(leagues, 'copy:b', board)).toBeUndefined();
  });

  it('lays an import over every starting point, keeping its goalie minimum', () => {
    const leagues = withPageLeague(NO_PAGE_LEAGUES, 'preset', base, synced('t1'));

    const copy = pageLeagueFor(leagues, 'copy:b', board);
    expect(copy?.yahooSync?.leagueName).toEqual('Mine');
    expect(copy?.scoringType).toEqual('points');
    expect(copy?.minGoalieGames).toEqual(20);
    expect(pageLeagueFor(leagues, 'copy:b', null)).toBeUndefined();
  });

  it('lets a hand edit after the import win where it was made', () => {
    let leagues = withPageLeague(NO_PAGE_LEAGUES, 'preset', base, synced('t1'));
    const onCopy = pageLeagueFor(leagues, 'copy:b', board)!;
    leagues = withPageLeague(leagues, 'copy:b', onCopy, { ...onCopy, leagueSize: 16 });

    expect(pageLeagueFor(leagues, 'copy:b', board)?.leagueSize).toEqual(16);
    expect(pageLeagueFor(leagues, 'preset', base)?.leagueSize).toEqual(10);
  });

  it('drops the edits made before a new import', () => {
    let leagues = withPageLeague(NO_PAGE_LEAGUES, 'copy:b', board, { ...board, leagueSize: 16 });
    leagues = withPageLeague(leagues, 'preset', base, synced('t2'));

    expect(pageLeagueFor(leagues, 'copy:b', board)?.leagueSize).toEqual(10);
  });
});
