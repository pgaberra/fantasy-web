import { describe, expect, it } from 'vitest';
import { TeamSchedule } from '../api/models/team-schedule';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { FreeAgent } from '../services/streamer-planner-free-agents.service';
import {
  availabilityLabel,
  formatGames,
  formatToi,
  groupByPosition,
  nightsFactor,
  RankedFreeAgent,
  scaledProjection,
  teamsByKey,
} from './planner-free-agents';

function scoringLine<K extends string>(keys: readonly K[], set: Record<string, number>) {
  return keys.reduce(
    (line, key) => ({ ...line, [key]: set[key] ?? 0 }),
    {} as Record<K, number>,
  ) as never;
}

function skater(name: string, positions: string[], team = 'EDM'): FreeAgent {
  return {
    playerId: name,
    name,
    teamAbbrev: team,
    positions,
    availability: 'FREE_AGENT',
    clubGames: 4,
    expectedGames: 3.8,
    projection: {
      type: 'skater',
      playerId: 1,
      stats: {
        scoring: scoringLine(SKATER_SCORING_STAT_KEYS, { goals: 2, assists: 3, shPct: 0.12 }),
        utility: { gp: 3.8, toiPerGame: 1052 },
      },
    },
  };
}

function ranked(player: FreeAgent, rank: number): RankedFreeAgent {
  return { player, score: 10 - rank, rank, games: 3 };
}

const TEAMS: TeamSchedule[] = [
  {
    team: 'TBL',
    games: 3,
    offNightGames: 0,
    backToBacks: 0,
    homeGames: 0,
    skaterScore: 3,
    skaterRank: 1,
    goalieScore: 3,
    goalieRank: 1,
    schedule: ['2026-10-12', '2026-10-14', '2026-10-17'].map((date) => ({
      date,
      opponent: 'SJS',
      home: true,
      offNight: false,
      backToBack: false,
      opponentGoalsAgainst: 1,
      opponentGoalsFor: 1,
    })),
  },
];

describe('groupByPosition', () => {
  it('lists the best of each position in lineup order, a two-way forward under both', () => {
    const rows = [
      ranked(skater('Winger', ['LW']), 1),
      ranked(skater('Two-way', ['C', 'LW']), 2),
      ranked(skater('Pivot', ['C']), 3),
      ranked(skater('Third wing', ['LW']), 4),
    ];

    const groups = groupByPosition(rows, 2);

    expect(groups.map((group) => group.position)).toEqual(['C', 'LW']);
    expect(groups[0].rows.map((row) => row.player.name)).toEqual(['Two-way', 'Pivot']);
    expect(groups[1].rows.map((row) => row.player.name)).toEqual(['Winger', 'Two-way']);
  });
});

describe('nightsFactor', () => {
  const teams = teamsByKey(TEAMS);
  const bolt = skater('Bolt', ['C'], 'TB');

  it("finds the club under the platform's spelling and keeps the share of its games counted", () => {
    expect(nightsFactor(bolt, teams, new Set(['2026-10-12', '2026-10-14']), false)).toBeCloseTo(
      2 / 3,
    );
  });

  it('is one while every night is counted, and for a club it cannot find', () => {
    expect(nightsFactor(bolt, teams, new Set(), true)).toBe(1);
    expect(nightsFactor(skater('Lost', ['C'], 'XYZ'), teams, new Set(['2026-10-12']), false)).toBe(
      1,
    );
  });
});

describe('scaledProjection', () => {
  it('scales the counting stats and the games, and leaves a rate and the ice time alone', () => {
    const scaled = scaledProjection(skater('Bolt', ['C']).projection, 0.5);

    expect(scaled.stats.scoring).toMatchObject({ goals: 1, assists: 1.5, shPct: 0.12 });
    expect(scaled.stats.utility).toMatchObject({ gp: 1.9, toiPerGame: 1052 });
  });

  it('returns the projection itself when there is nothing to scale', () => {
    const projection = skater('Bolt', ['C']).projection;
    expect(scaledProjection(projection, 1)).toBe(projection);
  });

  it('scales a goalie line the same way', () => {
    const goalie: FreeAgent['projection'] = {
      type: 'goalie',
      playerId: 2,
      stats: {
        scoring: scoringLine(GOALIE_SCORING_STAT_KEYS, { w: 2, sv: 60, svPct: 0.91, gaa: 2.5 }),
        utility: { gp: 2 },
      },
    };
    const scaled = scaledProjection(goalie, 0.5);
    expect(scaled.stats.scoring).toMatchObject({ w: 1, sv: 30, svPct: 0.91, gaa: 2.5 });
  });
});

describe('formatting', () => {
  it('writes ice time as minutes and seconds', () => {
    expect(formatToi(1052)).toBe('17:32');
    expect(formatToi(600)).toBe('10:00');
    expect(formatToi(undefined)).toBe('');
    expect(formatToi(0)).toBe('');
  });

  it('writes games to a decimal only where the expectation has one', () => {
    expect(formatGames(3)).toBe('3');
    expect(formatGames(3.75)).toBe('3.8');
  });

  it('names a status', () => {
    expect(availabilityLabel('FREE_AGENT')).toBe('Free agent');
    expect(availabilityLabel('WAIVERS')).toBe('Waivers');
    expect(availabilityLabel('UNKNOWN')).toBe('Available');
  });
});
