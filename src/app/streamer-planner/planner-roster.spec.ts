import { describe, expect, it } from 'vitest';
import { PlannerMyTeamResponse } from '../api/models/planner-my-team-response';
import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamSchedule } from '../api/models/team-schedule';
import { Projection } from '../models/projection.model';
import {
  lineupStarts,
  LOWEST_FIRST,
  nextRosterSort,
  rosterPlayers,
  RosterRow,
  rosterRows,
  sortRoster,
} from './planner-roster';

const NONE: RosterSlots = { c: 0, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 0, bn: 0, g: 0 };

function slots(partial: Partial<RosterSlots>): RosterSlots {
  return { ...NONE, ...partial };
}

function club(team: string, dates: readonly string[]): TeamSchedule {
  return {
    team,
    games: dates.length,
    offNightGames: 0,
    backToBacks: 0,
    homeGames: 0,
    skaterScore: 0,
    skaterRank: 1,
    goalieScore: 0,
    goalieRank: 1,
    schedule: dates.map((date) => ({
      date,
      opponent: 'BOS',
      home: true,
      offNight: false,
      backToBack: false,
      opponentGoalsAgainst: 1,
      opponentGoalsFor: 1,
      skaterWorth: 1,
      goalieWorth: 1,
      statWorth: {},
      plusMinusPerMinute: 0,
    })),
  };
}

function rostered(
  playerId: string,
  team: string,
  positions: string[],
  out = false,
): PlannerRosterPlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    teamAbbrev: team,
    type: positions.includes('G') ? 'goalie' : 'skater',
    positions,
    out,
  };
}

const MON = '2026-10-12';
const TUE = '2026-10-13';
const THU = '2026-10-15';

const TEAMS = new Map([
  ['EDM', club('EDM', [MON, TUE, THU])],
  ['TBL', club('TBL', [TUE])],
]);

describe('rosterPlayers', () => {
  it('shapes each player with a line as a free agent, and leaves out one the model has no line for', () => {
    const team: PlannerMyTeamResponse = {
      found: true,
      players: [
        rostered('1', 'EDM', ['C']),
        rostered('2', 'EDM', ['G']),
        rostered('3', 'EDM', ['D']),
      ],
      lines: [
        {
          playerId: '1',
          clubGames: 3,
          expectedGames: 2.7,
          stats: { goals: 1.2, toiPerGame: 1100 },
          nights: [],
        },
        {
          playerId: '2',
          clubGames: 3,
          expectedGames: 2,
          stats: { w: 1.1, svPct: 0.91 },
          nights: [],
        },
      ],
    };
    const players = rosterPlayers(team);

    expect(players.map((player) => player.playerId)).toEqual(['1', '2']);
    expect(players[0]).toMatchObject({ type: 'skater', clubGames: 3, expectedGames: 2.7 });
    expect([...players[0].projected]).toEqual(['goals', 'toiPerGame']);
    expect(players[0].projection).toMatchObject({
      type: 'skater',
      playerId: 1,
      stats: { scoring: { goals: 1.2, assists: 0 }, utility: { gp: 2.7, toiPerGame: 1100 } },
    });
    expect(players[1].projection).toMatchObject({
      type: 'goalie',
      stats: { scoring: { w: 1.1, svPct: 0.91 }, utility: { gp: 2 } },
    });
  });
});

describe('lineupStarts', () => {
  it('seats the players worth the most a game, and benches the rest with their game', () => {
    // Three Cs for two C spots on Tuesday, when all three play: the least valuable sits.
    const roster = [
      rostered('1', 'EDM', ['C']),
      rostered('2', 'TB', ['C']),
      rostered('3', 'EDM', ['C']),
    ];
    const value = (id: string) => ({ '1': 1, '2': 3, '3': 2 })[id] ?? 0;
    const starts = lineupStarts(roster, slots({ c: 2 }), TEAMS, [MON, TUE, THU], value);

    expect([...(starts.get('1') ?? [])]).toEqual([MON, THU]);
    expect([...(starts.get('2') ?? [])]).toEqual([TUE]);
    expect([...(starts.get('3') ?? [])]).toEqual([MON, TUE, THU]);
  });

  it('moves a dual-position player over to seat a better one, rather than bench him', () => {
    // One C spot and one LW spot. The C/LW is worth less than the pure C, but is seated at LW,
    // so both start.
    const roster = [rostered('1', 'EDM', ['C', 'LW']), rostered('2', 'EDM', ['C'])];
    const starts = lineupStarts(roster, slots({ c: 1, lw: 1 }), TEAMS, [MON], (id) =>
      id === '2' ? 2 : 1,
    );

    expect(starts.get('1')?.has(MON)).toBe(true);
    expect(starts.get('2')?.has(MON)).toBe(true);
  });

  it('starts nobody who is out, has no position, or is on a club the schedule does not know', () => {
    const roster = [
      rostered('1', 'EDM', ['C'], true),
      rostered('2', 'EDM', []),
      rostered('3', 'ARI', ['C']),
    ];
    const starts = lineupStarts(roster, slots({ c: 3 }), TEAMS, [MON], () => 1);

    expect(starts.size).toBe(0);
  });

  it('gives a player the model has no line for a spot too, after everyone with one', () => {
    // The unprojected player is worth nothing by the value given, so he is the one benched.
    const roster = [rostered('1', 'EDM', ['C']), rostered('2', 'EDM', ['C'])];
    const starts = lineupStarts(roster, slots({ c: 1 }), TEAMS, [MON], (id) =>
      id === '1' ? 1 : 0,
    );

    expect(starts.get('1')?.has(MON)).toBe(true);
    expect(starts.has('2')).toBe(false);
  });
});

function skaterLine(playerId: string, goals: number): Projection {
  return {
    type: 'skater',
    playerId: Number(playerId),
    stats: {
      scoring: { goals, assists: 0 } as never,
      utility: { gp: 3, toiPerGame: 1000 },
    },
  };
}

function goalieLine(playerId: string, wins: number): Projection {
  return {
    type: 'goalie',
    playerId: Number(playerId),
    stats: {
      scoring: { w: wins, svPct: 0.91 } as never,
      utility: { gp: 2 },
    },
  };
}

function own(playerId: string, positions: string[], projection: Projection, out = false) {
  return {
    ...rostered(playerId, 'EDM', positions, out),
    type: projection.type,
    clubGames: 3,
    expectedGames: projection.stats.utility.gp,
    projected: new Set(Object.keys(projection.stats.scoring)),
    projection,
  };
}

/** A goal at 3 and a win at 4, as a points league pays them. */
const score = (lines: readonly Projection[]) =>
  lines.map((line) => {
    const scoring = line.stats.scoring as Record<string, number>;
    return 3 * (scoring['goals'] ?? 0) + 4 * (scoring['w'] ?? 0);
  });

describe('rosterRows', () => {
  const counted = new Set([MON, TUE, THU]);

  it('gives a player benched every night no line and no start, and lists him first', () => {
    const starts = new Map([
      ['1', new Set([MON, TUE, THU])],
      ['2', new Set([MON, THU])],
    ]);
    const rows = rosterRows(
      [
        own('1', ['C'], skaterLine('1', 3)),
        own('2', ['C'], skaterLine('2', 1.5)),
        own('3', ['C'], skaterLine('3', 0.9)),
      ],
      starts,
      TEAMS,
      counted,
      [MON, TUE, THU],
      score,
      () => 0,
    );

    expect(rows.map((row) => row.player.playerId)).toEqual(['3', '2', '1']);
    const [benched, partly, every] = rows;
    expect(benched).toMatchObject({ rank: 1, score: 0, games: 0, clubGames: 3 });
    expect(benched.line.stats.scoring).toMatchObject({ goals: 0 });
    expect(benched.nights.map((night) => night.status)).toEqual(['bench', 'bench', 'bench']);
    // Two of three games started: two thirds of his line, over the two games.
    expect(partly).toMatchObject({ rank: 2, score: 3, games: 2, clubGames: 3 });
    expect(partly.nights.map((night) => night.status)).toEqual(['start', 'bench', 'start']);
    expect(every).toMatchObject({ rank: 3, score: 9, games: 3, clubGames: 3 });
  });

  it('marks the nights a player out, or on a club with no game, as no game', () => {
    const rows = rosterRows(
      [
        own('1', ['C'], skaterLine('1', 3), true),
        { ...own('2', ['C'], skaterLine('2', 3)), clubGames: 1, expectedGames: 1 },
      ],
      new Map(),
      new Map([['EDM', club('EDM', [MON])]]),
      new Set([MON, TUE]),
      [MON, TUE],
      score,
      () => 0,
    );

    expect(rows[0].nights.map((night) => night.status)).toEqual(['none', 'none']);
    expect(rows[1].nights.map((night) => night.status)).toEqual(['bench', 'none']);
    // Nights counted the club does not play hold none of his games.
    expect(rows[1].clubGames).toBe(1);
  });

  it("gives a goalie the starts his seated nights' share of the crease holds, as whole starts", () => {
    const rows = rosterRows(
      [own('1', ['G'], goalieLine('1', 1.2))],
      new Map([['1', new Set([MON])]]),
      TEAMS,
      counted,
      [MON, TUE, THU],
      score,
      () => 0,
    );

    // Two expected starts over three nights; one night seated is two thirds of a start, so one.
    expect(rows[0].games).toBe(1);
    expect(rows[0].line.stats.scoring).toMatchObject({ w: 0.6, svPct: 0.91 });
  });

  it('parts players level on the score by what a game of each is worth, then by name', () => {
    const rows = rosterRows(
      [own('1', ['C'], skaterLine('1', 0)), own('2', ['C'], skaterLine('2', 0))],
      new Map(),
      TEAMS,
      counted,
      [MON],
      score,
      (id) => (id === '1' ? 2 : 1),
    );

    expect(rows.map((row) => row.player.playerId)).toEqual(['2', '1']);
  });
});

describe('sortRoster', () => {
  const row = (playerId: string, rank: number, score: number, clubGames: number): RosterRow => ({
    player: own(playerId, ['C'], skaterLine(playerId, score)),
    line: skaterLine(playerId, score),
    score,
    rank,
    games: 1,
    clubGames,
    nights: [],
  });
  const rows = [row('1', 1, 0, 3), row('2', 2, 2, 1), row('3', 3, 5, 3)];

  it('opens lowest first, and sorts by the games on the nights most first', () => {
    expect(sortRoster(rows, LOWEST_FIRST).map((r) => r.player.playerId)).toEqual(['1', '2', '3']);
    const byGames = nextRosterSort(LOWEST_FIRST, 'clubGames');
    expect(byGames).toEqual({ key: 'clubGames', descending: true });
    // Level on the games, the lowest-first order holds.
    expect(sortRoster(rows, byGames).map((r) => r.player.playerId)).toEqual(['1', '3', '2']);
    expect(
      sortRoster(rows, nextRosterSort(byGames, 'clubGames')).map((r) => r.player.playerId),
    ).toEqual(['2', '1', '3']);
  });

  it('turns the score round like the free agents, and sorts a category best first', () => {
    expect(nextRosterSort(LOWEST_FIRST, 'score')).toEqual({ key: 'score', descending: true });
    expect(nextRosterSort(LOWEST_FIRST, 'goals')).toEqual({ key: 'goals', descending: true });
    expect(
      sortRoster(rows, { key: 'score', descending: true }).map((r) => r.player.playerId),
    ).toEqual(['3', '2', '1']);
  });
});
