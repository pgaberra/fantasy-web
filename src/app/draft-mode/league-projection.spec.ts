import { describe, it, expect } from 'vitest';
import {
  buildLeagueProjection,
  LeagueProjectionPlayer,
  LeagueProjectionTeamInput,
} from './league-projection';
import { GoalieScoringStats, Projection, SkaterScoringStats } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';

function skaterScoring(overrides: Partial<SkaterScoringStats>): SkaterScoringStats {
  const base = SKATER_SCORING_STAT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as SkaterScoringStats,
  );
  return { ...base, ...overrides };
}

function goalieScoring(overrides: Partial<GoalieScoringStats>): GoalieScoringStats {
  const base = GOALIE_SCORING_STAT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as GoalieScoringStats,
  );
  return { ...base, ...overrides };
}

function skater(playerId: number, overrides: Partial<SkaterScoringStats>): Projection {
  return {
    playerId,
    type: 'skater',
    stats: { scoring: skaterScoring(overrides), utility: { gp: 82, toiPerGame: 18 } },
  };
}

function goalie(playerId: number, overrides: Partial<GoalieScoringStats>): Projection {
  return {
    playerId,
    type: 'goalie',
    stats: { scoring: goalieScoring(overrides), utility: { gp: 60 } },
  };
}

function player(
  projection: Projection,
  score: number,
  positions: string[],
  name = `Player ${projection.playerId}`,
): LeagueProjectionPlayer {
  return { name, score, projection, positions };
}

describe('buildLeagueProjection', () => {
  it('ranks teams by total and sums counting categories', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, { goals: 40, assists: 50 }), 10, ['C'])],
      [2, player(skater(2, { goals: 30, assists: 20 }), 6, ['LW'])],
      [3, player(skater(3, { goals: 10, assists: 15 }), 3, ['D'])],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: true, playerIds: [1, 2] },
      { id: 'b', name: 'Bravo', mine: false, playerIds: [3] },
    ];

    const data = buildLeagueProjection(teams, players, ['goals', 'assists']);

    expect(data.teams.map((team) => team.teamId)).toEqual(['a', 'b']);
    expect(data.teams[0].total).toEqual(16);
    expect(data.teams[0].values['goals']).toEqual(70);
    expect(data.teams[0].values['assists']).toEqual(70);
    expect(data.teams[1].values['goals']).toEqual(10);
  });

  it('averages rate categories and yields null when a team has no eligible player', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(goalie(1, { svPct: 0.92 }), 8, ['G'])],
      [2, player(goalie(2, { svPct: 0.9 }), 6, ['G'])],
      [3, player(skater(3, { goals: 20 }), 4, ['C'])],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: false, playerIds: [1, 2] },
      { id: 'b', name: 'Bravo', mine: false, playerIds: [3] },
    ];

    const data = buildLeagueProjection(teams, players, ['svPct']);

    expect(data.teams.find((team) => team.teamId === 'a')?.values['svPct']).toBeCloseTo(0.91, 5);
    expect(data.teams.find((team) => team.teamId === 'b')?.values['svPct']).toBeNull();
  });

  it('attributes multi-position players to every eligible position', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, {}), 10, ['C', 'LW'])],
      [2, player(skater(2, {}), 4, ['D'])],
      [3, player(goalie(3, {}), 7, ['G'])],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: false, playerIds: [1, 2, 3] },
    ];

    const data = buildLeagueProjection(teams, players, []);

    const alpha = data.teams[0];
    expect(alpha.values['C']).toEqual(10);
    expect(alpha.values['LW']).toEqual(10);
    expect(alpha.values['RW']).toEqual(0);
    expect(alpha.values['D']).toEqual(4);
    expect(alpha.values['G']).toEqual(7);
    expect(alpha.positionBreakdown['C'].map((entry) => entry.name)).toEqual(['Player 1']);
    expect(alpha.positionBreakdown['LW'].map((entry) => entry.name)).toEqual(['Player 1']);
    expect(alpha.positionBreakdown['RW']).toEqual([]);
    expect(alpha.positionBreakdown['G']).toEqual([{ name: 'Player 3', value: 7 }]);
  });

  it("sorts each position's contributing players by value descending", () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, {}), 5, ['C'], 'Low')],
      [2, player(skater(2, {}), 15, ['C'], 'High')],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: false, playerIds: [1, 2] },
    ];

    const data = buildLeagueProjection(teams, players, []);

    expect(data.teams[0].positionBreakdown['C']).toEqual([
      { name: 'High', value: 15 },
      { name: 'Low', value: 5 },
    ]);
    expect(data.teams[0].values['C']).toEqual(20);
  });

  it('exposes category and position column metadata', () => {
    const data = buildLeagueProjection([], new Map(), ['goals', 'gaa']);

    expect(data.categoryColumns.map((column) => column.key)).toEqual(['goals', 'gaa']);
    expect(data.categoryColumns[1].lowerIsBetter).toBe(true);
    expect(data.positionColumns.map((column) => column.key)).toEqual(['C', 'LW', 'RW', 'D', 'G']);
  });
});
