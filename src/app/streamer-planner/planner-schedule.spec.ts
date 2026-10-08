import { describe, expect, it } from 'vitest';
import { PlannerWeek } from '../api/models/planner-week';
import { ScheduledGame } from '../api/models/scheduled-game';
import { TeamSchedule } from '../api/models/team-schedule';
import {
  clampStretch,
  leadingDays,
  hockeyNight,
  matchupTier,
  plannerDays,
  presetStretch,
  rankTier,
  rateTeams,
  weekColumn,
  weeksTitle,
} from './planner-schedule';

function game(date: string, overrides: Partial<ScheduledGame> = {}): ScheduledGame {
  return {
    date,
    opponent: 'SJS',
    home: false,
    offNight: false,
    backToBack: false,
    opponentGoalsAgainst: 1,
    opponentGoalsFor: 1,
    skaterWorth: 1,
    goalieWorth: 1,
    ...overrides,
  };
}

/** A team as the server rates it over a whole stretch, its score and rank already settled. */
function team(
  name: string,
  schedule: ScheduledGame[],
  skaterRank = 1,
  goalieRank = 1,
): TeamSchedule {
  return {
    team: name,
    games: schedule.length,
    offNightGames: 0,
    backToBacks: 0,
    homeGames: 0,
    skaterScore: 9.99,
    skaterRank,
    goalieScore: 8.88,
    goalieRank,
    schedule,
  };
}

const WEEKS: PlannerWeek[] = [
  { week: 1, start: '2026-10-07', end: '2026-10-11', games: 30 },
  { week: 2, start: '2026-10-12', end: '2026-10-18', games: 50 },
  { week: 3, start: '2026-10-19', end: '2026-10-25', games: 50 },
  { week: 4, start: '2026-10-26', end: '2026-11-01', games: 50 },
  { week: 5, start: '2026-11-02', end: '2026-11-08', games: 50 },
  { week: 6, start: '2026-11-09', end: '2026-11-15', games: 50 },
];

describe('plannerDays', () => {
  it('lists every date of the stretch, a night without games included', () => {
    const days = plannerDays({
      start: '2026-10-12',
      end: '2026-10-14',
      offNightMaxGames: 7,
      nights: [{ date: '2026-10-13', games: 3, offNight: true }],
      teams: [],
    });

    expect(days).toEqual([
      { date: '2026-10-12', games: 0, offNight: false },
      { date: '2026-10-13', games: 3, offNight: true },
      { date: '2026-10-14', games: 0, offNight: false },
    ]);
  });
});

describe('rateTeams', () => {
  const edm = team(
    'EDM',
    [
      game('2026-10-12', {
        home: true,
        opponentGoalsAgainst: 1.12,
        opponentGoalsFor: 1.08,
        skaterWorth: 1.16,
        goalieWorth: 0.96,
      }),
      game('2026-10-13', {
        offNight: true,
        backToBack: true,
        opponentGoalsAgainst: 0.9,
        skaterWorth: 1.09,
        goalieWorth: 1.3,
      }),
    ],
    2,
    1,
  );
  const cgy = team(
    'CGY',
    [game('2026-10-13', { offNight: true, opponentGoalsAgainst: 1.2, skaterWorth: 1.45 })],
    1,
    2,
  );

  it("keeps the server's score and rank while every night is counted", () => {
    const rows = rateTeams([edm, cgy], new Set(), true);

    expect(rows.map((row) => [row.team, row.score, row.rank])).toEqual([
      ['CGY', 9.99, 1],
      ['EDM', 9.99, 2],
    ]);
    expect(rows[1]).toMatchObject({
      games: 2,
      homeGames: 1,
      awayGames: 1,
      offNightGames: 1,
      backToBacks: 1,
      favourable: 1,
      unfavourable: 1,
    });
  });

  it('rates only the nights counted, summing the worth the server put on each game', () => {
    const rows = rateTeams([edm, cgy], new Set(['2026-10-13']), false);

    // Only the 13th counts: EDM's game there is worth 1.09, CGY's 1.45.
    expect(rows.map((row) => [row.team, row.score, row.rank])).toEqual([
      ['CGY', 1.45, 1],
      ['EDM', 1.09, 2],
    ]);
    expect(rows[1].games).toBe(1);
    expect(rows[1].schedule.map((entry) => entry.date)).toEqual(['2026-10-13']);
  });

  it("rates every team by the server's skater worth, never the goalie's", () => {
    const rows = rateTeams([edm], new Set(['2026-10-12']), false);

    expect(rows[0].score).toBeCloseTo(1.16, 2);
  });

  it('sums the worth of every night kept', () => {
    const rows = rateTeams([edm], new Set(['2026-10-12', '2026-10-13']), false);

    expect(rows[0].score).toBeCloseTo(2.25, 2);
  });

  it('lets level teams share a rank and skips the next one', () => {
    const a = team('A', [game('2026-10-12', { skaterWorth: 1.1 })]);
    const b = team('B', [game('2026-10-12', { skaterWorth: 1.1 })]);
    const c = team('C', [game('2026-10-12', { skaterWorth: 1.0 })]);

    const rows = rateTeams([c, b, a], new Set(['2026-10-12']), false);

    expect(rows.map((row) => [row.team, row.rank])).toEqual([
      ['A', 1],
      ['B', 1],
      ['C', 3],
    ]);
  });
});

describe('matchups', () => {
  const scored = game('2026-10-13', {
    offNight: true,
    backToBack: true,
    opponentGoalsAgainst: 1.12,
    opponentGoalsFor: 1.08,
  });

  it('tints a matchup by the goals the opponent concedes, whatever it scores', () => {
    expect(matchupTier(scored)).toBe('good');
    // Concedes few and scores few: good for a goalie, but the one tint is the skaters'.
    expect(
      matchupTier(game('2026-10-13', { opponentGoalsAgainst: 0.9, opponentGoalsFor: 0.9 })),
    ).toBe('bad');
    expect(matchupTier(game('2026-10-13'))).toBeNull();
  });

  it('tints the top and bottom quarter of the ranks', () => {
    expect(rankTier(8, 32)).toBe('good');
    expect(rankTier(9, 32)).toBeNull();
    expect(rankTier(25, 32)).toBe('bad');
  });
});

describe('presets', () => {
  // A Wednesday in week 2.
  const TODAY = '2026-10-14';

  it('names the rest of this week from today, next week whole, and both together', () => {
    expect(presetStretch('this-week', WEEKS, TODAY)).toEqual({
      start: '2026-10-14',
      end: '2026-10-18',
    });
    expect(presetStretch('next-week', WEEKS, TODAY)).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    });
    expect(presetStretch('two-weeks', WEEKS, TODAY)).toEqual({
      start: '2026-10-14',
      end: '2026-10-25',
    });
  });

  it('starts on opening night before the season, and has no next week after its last', () => {
    expect(presetStretch('this-week', WEEKS, '2026-10-01')).toEqual({
      start: '2026-10-07',
      end: '2026-10-11',
    });
    expect(presetStretch('next-week', WEEKS, '2026-11-10')).toBeUndefined();
    expect(presetStretch('two-weeks', WEEKS, '2026-11-10')).toBeUndefined();
    expect(presetStretch('this-week', [], TODAY)).toBeUndefined();
  });

  it('holds a stretch to today, the season and the longest stretch the server rates', () => {
    // A start in the past moves up to today; an end before the start moves up to it.
    expect(clampStretch({ start: '2026-10-12', end: '2026-10-13' }, WEEKS, TODAY)).toEqual({
      start: '2026-10-14',
      end: '2026-10-14',
    });
    // 31 days from Oct 14 is Nov 13; the season's last day is Nov 15.
    expect(clampStretch({ start: '2026-10-14', end: '2026-12-01' }, WEEKS, TODAY)).toEqual({
      start: '2026-10-14',
      end: '2026-11-13',
    });
    expect(clampStretch({ start: '2026-11-09', end: '2026-12-01' }, WEEKS, TODAY)).toEqual({
      start: '2026-11-09',
      end: '2026-11-15',
    });
    expect(clampStretch({ start: '2026-10-14', end: '2026-10-20' }, [], TODAY)).toBeUndefined();
  });

  it('names the weeks a stretch touches', () => {
    expect(weeksTitle(WEEKS, { start: '2026-10-19', end: '2026-10-25' })).toBe('Week 3');
    expect(weeksTitle(WEEKS, { start: '2026-10-22', end: '2026-11-03' })).toBe('Weeks 3-5');
    expect(weeksTitle(WEEKS, { start: '2027-01-01', end: '2027-01-02' })).toBe('');
  });

  it('places a date in its Monday-first week, and lists the days of the week before a start', () => {
    expect(weekColumn('2026-10-12')).toBe(1);
    expect(weekColumn('2026-10-18')).toBe(7);
    expect(leadingDays('2026-10-15')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(leadingDays('2026-10-12')).toEqual([]);
  });

  it("dates today by the NHL's night, which runs until 01:00 Eastern the next morning", () => {
    // 00:34 in Stockholm on 2 October is still Thursday's night: its games have not started.
    expect(hockeyNight(new Date('2026-10-01T22:34:00Z'))).toBe('2026-10-01');
    // By 01:00 Eastern (EDT, UTC-4; 07:00 in Stockholm) the last game of the night has started.
    expect(hockeyNight(new Date('2026-10-02T04:59:00Z'))).toBe('2026-10-01');
    expect(hockeyNight(new Date('2026-10-02T05:00:00Z'))).toBe('2026-10-02');
    // 10:52 in Stockholm on a Monday is Monday: Sunday's games are all over.
    expect(hockeyNight(new Date('2026-10-05T08:52:00Z'))).toBe('2026-10-05');
    // In winter Eastern is UTC-5.
    expect(hockeyNight(new Date('2026-01-05T05:59:00Z'))).toBe('2026-01-04');
    expect(hockeyNight(new Date('2026-01-05T06:00:00Z'))).toBe('2026-01-05');
  });
});
