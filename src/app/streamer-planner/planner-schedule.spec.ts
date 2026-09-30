import { describe, expect, it } from 'vitest';
import { PlannerWeek } from '../api/models/planner-week';
import { ScheduledGame } from '../api/models/scheduled-game';
import { TeamSchedule } from '../api/models/team-schedule';
import {
  daysBetween,
  endWeekOptions,
  matchupLabel,
  matchupTier,
  plannerDays,
  rankTier,
  rateTeams,
  weeksLabel,
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
      game('2026-10-12', { home: true, opponentGoalsAgainst: 1.12, opponentGoalsFor: 1.08 }),
      game('2026-10-13', { offNight: true, backToBack: true, opponentGoalsAgainst: 0.9 }),
    ],
    2,
    1,
  );
  const cgy = team(
    'CGY',
    [game('2026-10-13', { offNight: true, opponentGoalsAgainst: 1.2 })],
    1,
    2,
  );

  it("keeps the server's score and rank while every night is counted", () => {
    const rows = rateTeams([edm, cgy], 'skaters', new Set(), true);

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

  it("rates only the nights counted, by the server's own rule, and ranks the result", () => {
    const rows = rateTeams([edm, cgy], 'skaters', new Set(['2026-10-13']), false);

    // EDM: one off-night game against a 0.9 opponent, 1.25 * 0.9. CGY: 1.25 * 1.2.
    expect(rows.map((row) => [row.team, row.score, row.rank])).toEqual([
      ['CGY', 1.5, 1],
      ['EDM', 1.13, 2],
    ]);
    expect(rows[1].games).toBe(1);
    expect(rows[1].schedule.map((entry) => entry.date)).toEqual(['2026-10-13']);
  });

  it('rates a goalie by the inverse of what the opponent scores', () => {
    const rows = rateTeams([edm], 'goalies', new Set(['2026-10-12']), false);

    expect(rows[0].score).toBeCloseTo(1 / 1.08, 2);
  });

  it('lets level teams share a rank and skips the next one', () => {
    const a = team('A', [game('2026-10-12', { opponentGoalsAgainst: 1.1 })]);
    const b = team('B', [game('2026-10-12', { opponentGoalsAgainst: 1.1 })]);
    const c = team('C', [game('2026-10-12', { opponentGoalsAgainst: 1.0 })]);

    const rows = rateTeams([c, b, a], 'skaters', new Set(['2026-10-12']), false);

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

  it('tints a matchup for skaters and goalies from opposite sides', () => {
    expect(matchupTier(scored, 'skaters')).toBe('good');
    expect(matchupTier(scored, 'goalies')).toBe('bad');
    expect(matchupTier(game('2026-10-13'), 'skaters')).toBeNull();
  });

  it('says what the tint means', () => {
    expect(matchupLabel(scored, 'skaters')).toBe(
      'at SJS. SJS allows 12% more goals than average. Off-night. Back-to-back.',
    );
    expect(matchupLabel(game('2026-10-13', { home: true }), 'goalies')).toBe(
      'vs SJS. SJS scores a league-average number of goals.',
    );
  });

  it('tints the top and bottom quarter of the ranks', () => {
    expect(rankTier(8, 32)).toBe('good');
    expect(rankTier(9, 32)).toBeNull();
    expect(rankTier(25, 32)).toBe('bad');
  });
});

describe('weeks', () => {
  it('offers ending weeks from the start up to the longest stretch the server rates', () => {
    // From the Monday of week 2, weeks 2 to 5 span 28 days; week 6 would make it 35.
    expect(endWeekOptions(WEEKS, WEEKS[1]).map((week) => week.week)).toEqual([2, 3, 4, 5]);
    expect(endWeekOptions(WEEKS, WEEKS[5]).map((week) => week.week)).toEqual([6]);
  });

  it('counts days with both ends included', () => {
    expect(daysBetween('2026-10-12', '2026-10-12')).toBe(1);
    expect(daysBetween('2026-10-12', '2026-10-18')).toBe(7);
  });

  it('names one week or an interval of them', () => {
    expect(weeksLabel(WEEKS[2], WEEKS[2])).toBe('Week 3');
    expect(weeksLabel(WEEKS[2], WEEKS[4])).toBe('Weeks 3 to 5');
  });
});
