import { describe, expect, it } from 'vitest';
import { TeamSchedule } from '../api/models/team-schedule';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../models/stat-key.model';
import { FreeAgent } from '../services/streamer-planner-free-agents.service';
import {
  formatGames,
  formatToi,
  filterByPositions,
  lineColumns,
  lineStats,
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

function skater(
  name: string,
  positions: string[],
  team = 'EDM',
  stats: Record<string, number> = { goals: 2, assists: 3, shPct: 0.12 },
): FreeAgent {
  return {
    playerId: name,
    name,
    teamAbbrev: team,
    positions,
    availability: 'FREE_AGENT',
    clubGames: 4,
    expectedGames: 3.8,
    projected: new Set(Object.keys(stats)),
    projection: {
      type: 'skater',
      playerId: 1,
      stats: {
        scoring: scoringLine(SKATER_SCORING_STAT_KEYS, stats),
        utility: { gp: 3.8, toiPerGame: 1052 },
      },
    },
  };
}

function goalie(stats: Record<string, number>): FreeAgent {
  return {
    playerId: 'Goalie',
    name: 'Goalie',
    teamAbbrev: 'TB',
    positions: ['G'],
    availability: 'FREE_AGENT',
    clubGames: 3,
    expectedGames: 2,
    projected: new Set(Object.keys(stats)),
    projection: {
      type: 'goalie',
      playerId: 2,
      stats: { scoring: scoringLine(GOALIE_SCORING_STAT_KEYS, stats), utility: { gp: 2 } },
    },
  };
}

function ranked(player: FreeAgent, rank: number, line = player.projection): RankedFreeAgent {
  return { player, line, score: 10 - rank, rank, games: 3 };
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

describe('filterByPositions', () => {
  const rows = [
    ranked(skater('Winger', ['LW']), 1),
    ranked(skater('Two-way', ['C', 'LW']), 2),
    ranked(skater('Pivot', ['C']), 3),
    ranked(skater('Blueliner', ['D']), 4),
  ];

  it('keeps every player, in ranked order, while no position is picked', () => {
    expect(filterByPositions(rows, new Set())).toBe(rows);
  });

  it('keeps anyone eligible at any position picked, once each and still best first', () => {
    const names = filterByPositions(rows, new Set(['C', 'D'] as const)).map(
      (row) => row.player.name,
    );

    expect(names).toEqual(['Two-way', 'Pivot', 'Blueliner']);
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

describe('lineStats', () => {
  /** A Yahoo categories league: seven for skaters, four for goalies, in the league's order. */
  const CATEGORIES = [
    'goals',
    'assists',
    'sog',
    'pim',
    'ppp',
    'blocks',
    'hits',
    'w',
    'gaa',
    'svPct',
    'sho',
  ] as const;

  function written(row: RankedFreeAgent, categories: readonly ScoringStatKey[] = CATEGORIES) {
    return lineStats(row, categories).map((stat) => `${stat.value} ${stat.label}`);
  }

  it("writes a skater's line in every skater category the league scores, in its order", () => {
    const row = ranked(
      skater('Winger', ['LW'], 'EDM', {
        goals: 1.84,
        assists: 2,
        sog: 15.06,
        pim: 3.2,
        ppp: 0.8,
        blocks: 4.1,
        hits: 6,
        // Projected, and not a category of this league: left out.
        fw: 12,
      }),
      1,
    );

    expect(written(row)).toEqual([
      '1.8 G',
      '2.0 A',
      '15.1 SOG',
      '3.2 PIM',
      '0.8 PPP',
      '4.1 BLK',
      '6.0 HIT',
    ]);
    expect(lineStats(row, CATEGORIES).map((stat) => stat.name)).toContain('Shots on Goal');
  });

  it("writes a goalie's in the goalie categories, a rate as the editor writes it", () => {
    const row = ranked(goalie({ w: 1.4, gaa: 2.613, svPct: 0.9084, sho: 0.12, sv: 57.4 }), 1);

    expect(written(row)).toEqual(['1.4 W', '2.61 GAA', '0.908 SV%', '0.1 SHO']);
    // Saves run to dozens in a week, so they are written whole.
    expect(written(row, ['sv'])).toEqual(['57 SV']);
  });

  it('reads the line over the nights counted, not the whole stretch', () => {
    const player = skater('Winger', ['LW'], 'EDM', { goals: 2, assists: 3 });
    const row = ranked(player, 1, scaledProjection(player.projection, 0.5));

    expect(written(row, ['goals', 'assists'])).toEqual(['1.0 G', '1.5 A']);
  });

  // The projection holds a zero for every stat, projected or not, because the ranking engine
  // needs a whole line. Written out, that zero would read as the model's own number.
  it('leaves out a category the model gave no number for', () => {
    const row = ranked(skater('Defender', ['D'], 'EDM', { goals: 1, assists: 2 }), 1);

    expect(written(row, ['goals', 'defPoints', 'assists'])).toEqual(['1.0 G', '2.0 A']);
  });

  it('signs a plus/minus, drops the decimal past a hundred, and writes ice time as a clock', () => {
    const row = ranked(
      skater('Grinder', ['C'], 'EDM', { plusMinus: 0.62, hits: 104.4, pim: 0, shPct: 11.94 }),
      1,
    );
    expect(written(row, ['plusMinus', 'hits', 'pim', 'shPct'])).toEqual([
      '+0.6 +/-',
      '104 HIT',
      '0.0 PIM',
      '11.9 SH%',
    ]);

    const minus = ranked(skater('Minus', ['C'], 'EDM', { plusMinus: -0.31 }), 1);
    expect(written(minus, ['plusMinus'])).toEqual(['-0.3 +/-']);
    const even = ranked(skater('Even', ['C'], 'EDM', { plusMinus: 0.04 }), 1);
    expect(written(even, ['plusMinus'])).toEqual(['0.0 +/-']);

    const starter = ranked(goalie({ toi: 7100 }), 1);
    expect(written(starter, ['toi'])).toEqual(['118:20 TOI']);
  });
});

describe('lineColumns', () => {
  function stat(key: ScoringStatKey, label: string) {
    return { key, label, name: label, value: '1.0' };
  }

  it("is every category any of the players has a number for, in the league's order", () => {
    const first = [stat('goals', 'G'), stat('sog', 'SOG')];
    const second = [stat('goals', 'G'), stat('assists', 'A')];

    expect(
      lineColumns([first, second], ['assists', 'goals', 'hits', 'sog']).map(
        (column) => column.label,
      ),
    ).toEqual(['A', 'G', 'SOG']);
  });

  it('is no column at all for players with nothing to write', () => {
    expect(lineColumns([[], []], ['goals'])).toEqual([]);
    expect(lineColumns([], ['goals'])).toEqual([]);
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
});
