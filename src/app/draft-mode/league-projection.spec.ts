import { describe, it, expect } from 'vitest';
import {
  buildLeagueProjection,
  LeagueProjectionPlayer,
  LeagueProjectionTeamInput,
} from './league-projection';
import { GoalieScoringStats, Projection, SkaterScoringStats } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { RosterSlots } from '../api/models/roster-slots';

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
  contributions: Record<string, number> = {},
  name = `Player ${projection.playerId}`,
): LeagueProjectionPlayer {
  return { name, score, projection, positions, contributions };
}

function slots(overrides: Partial<RosterSlots>): RosterSlots {
  return { c: 0, lw: 0, rw: 0, d: 0, util: 0, g: 0, bn: 0, ...overrides };
}

describe('buildLeagueProjection', () => {
  it('ranks teams by total and sums weighted category contributions to the total', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, { goals: 40, assists: 50 }), 10, ['C'], { goals: 4, assists: 6 })],
      [2, player(skater(2, { goals: 30, assists: 20 }), 5, ['LW'], { goals: 3, assists: 2 })],
      [3, player(skater(3, { goals: 10, assists: 15 }), 3, ['D'], { goals: 1, assists: 2 })],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: true, playerIds: [1, 2] },
      { id: 'b', name: 'Bravo', mine: false, playerIds: [3] },
    ];

    const data = buildLeagueProjection(
      teams,
      players,
      ['goals', 'assists'],
      slots({ c: 2, lw: 2, d: 2, util: 1, g: 1, bn: 2 }),
      'points',
      null,
    );

    expect(data.teams.map((team) => team.teamId)).toEqual(['a', 'b']);
    expect(data.teams[0].total).toEqual(15);
    expect(data.teams[0].values['goals']).toEqual(7);
    expect(data.teams[0].values['assists']).toEqual(8);
    // A row's category cells sum to its total.
    expect(data.teams[0].values['goals'] + data.teams[0].values['assists']).toEqual(
      data.teams[0].total,
    );
    expect(data.teams[1].values['goals']).toEqual(1);
  });

  it('lists the roster once per player, best first, with raw values and gaps where a stat does not apply', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, { goals: 30 }), 3, ['C'], { goals: 3 }, 'Low')],
      [2, player(skater(2, { goals: 50 }), 5, ['C'], { goals: 5 }, 'High')],
      [3, player(goalie(3, { ga: 200 }), -4, ['G'], { ga: -4 }, 'Leaky')],
      [4, player(goalie(4, { ga: 150 }), -2, ['G'], { ga: -2 }, 'Stingy')],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: false, playerIds: [1, 2, 3, 4] },
    ];

    const data = buildLeagueProjection(
      teams,
      players,
      ['goals', 'ga'],
      slots({ c: 2, g: 2, bn: 2 }),
      'points',
      null,
    );

    // Each player appears exactly once, ordered by their overall value — not once per category.
    expect(data.teams[0].roster).toEqual([
      { name: 'High', total: 5, values: { goals: 50, ga: null } },
      { name: 'Low', total: 3, values: { goals: 30, ga: null } },
      { name: 'Stingy', total: -2, values: { goals: null, ga: 150 } },
      { name: 'Leaky', total: -4, values: { goals: null, ga: 200 } },
    ]);
  });

  it('assigns each player to a single roster slot, benching the worst and flexing the next-worst to Util', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, {}), 10, ['LW'], {}, 'Best')],
      [2, player(skater(2, {}), 8, ['LW'], {}, 'Second')],
      [3, player(skater(3, {}), 6, ['LW'], {}, 'Third')],
      [4, player(skater(4, {}), 4, ['LW'], {}, 'Fourth')],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: false, playerIds: [1, 2, 3, 4] },
    ];

    const data = buildLeagueProjection(
      teams,
      players,
      [],
      slots({ lw: 2, util: 1, bn: 1 }),
      'points',
      null,
    );

    const alpha = data.teams[0];
    expect(alpha.positionPlayers['LW'].map((entry) => entry.name)).toEqual(['Best', 'Second']);
    expect(alpha.positionPlayers['UTIL'].map((entry) => entry.name)).toEqual(['Third']);
    expect(alpha.positionPlayers['BN'].map((entry) => entry.name)).toEqual(['Fourth']);
    expect(alpha.values['LW']).toEqual(18);
    expect(alpha.values['UTIL']).toEqual(6);
    expect(alpha.values['BN']).toEqual(4);
  });

  it('reassigns a dual-position player so a single-position player can start, counting each once', () => {
    const players = new Map<number, LeagueProjectionPlayer>([
      [1, player(skater(1, {}), 10, ['C', 'LW'], {}, 'Dual')],
      [2, player(skater(2, {}), 8, ['C'], {}, 'CenterOnly')],
      [3, player(skater(3, {}), 6, ['LW'], {}, 'WingOnly')],
    ]);
    const teams: LeagueProjectionTeamInput[] = [
      { id: 'a', name: 'Alpha', mine: false, playerIds: [1, 2, 3] },
    ];

    const data = buildLeagueProjection(teams, players, [], slots({ c: 1, lw: 1 }), 'points', null);

    const alpha = data.teams[0];
    // The dual player yields Center to the center-only player and starts at LW; the wing-only
    // player is the odd one out and lands on the (auto-added) bench. Nobody is double-counted.
    expect(alpha.positionPlayers['C'].map((entry) => entry.name)).toEqual(['CenterOnly']);
    expect(alpha.positionPlayers['LW'].map((entry) => entry.name)).toEqual(['Dual']);
    expect(alpha.positionPlayers['BN'].map((entry) => entry.name)).toEqual(['WingOnly']);
  });

  it('exposes category and position column metadata driven by scoring type and roster slots', () => {
    const pointsData = buildLeagueProjection(
      [],
      new Map(),
      ['goals', 'gaa'],
      slots({ c: 2, lw: 2, rw: 2, d: 4, util: 2, g: 2, bn: 3 }),
      'points',
      { goals: 3, gaa: -1 },
    );

    expect(pointsData.categoryColumns.map((column) => column.key)).toEqual(['goals', 'gaa']);
    expect(pointsData.categoryColumns.map((column) => column.decimals)).toEqual([1, 1]);
    expect(pointsData.categoryColumns.map((column) => column.rawDecimals)).toEqual([0, 2]);
    // A points league surfaces each stat's scoring weight; position columns never carry one.
    expect(pointsData.categoryColumns.map((column) => column.weight)).toEqual([3, -1]);
    expect(pointsData.positionColumns.every((column) => column.weight === null)).toBe(true);
    expect(pointsData.positionColumns.map((column) => column.key)).toEqual([
      'C',
      'LW',
      'RW',
      'D',
      'UTIL',
      'G',
      'BN',
    ]);

    const categoryData = buildLeagueProjection(
      [],
      new Map(),
      ['goals'],
      slots({ c: 2, lw: 2, rw: 2, d: 4, g: 2 }),
      'category',
      { goals: 3 },
    );

    expect(categoryData.categoryColumns[0].decimals).toEqual(2);
    // A category/roto league scores on z-scores, so a stat weight would be misleading — omit it.
    expect(categoryData.categoryColumns[0].weight).toBeNull();
    // No Util and no bench slots (and no overflow) → neither column is shown.
    expect(categoryData.positionColumns.map((column) => column.key)).toEqual([
      'C',
      'LW',
      'RW',
      'D',
      'G',
    ]);
  });
});
