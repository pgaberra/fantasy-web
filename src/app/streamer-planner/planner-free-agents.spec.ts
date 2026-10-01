import { describe, expect, it } from 'vitest';
import { PlannerCrease } from '../api/models/planner-crease';
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
  ofKind,
  projectedStarts,
  RankedFreeAgent,
  scaledProjection,
  startsProjection,
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
      skaterWorth: 1.036,
      goalieWorth: 1.0363,
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

describe('ofKind', () => {
  const rows = [
    ranked(skater('Winger', ['LW']), 1),
    ranked(goalie({ w: 2 }), 2),
    ranked(skater('Pivot', ['C']), 3),
  ];

  it('keeps one kind of player, best first, each placed among his own kind', () => {
    expect(ofKind(rows, 'skater').map((row) => [row.player.name, row.rank])).toEqual([
      ['Winger', 1],
      ['Pivot', 2],
    ]);
    expect(ofKind(rows, 'goalie').map((row) => [row.player.name, row.rank])).toEqual([
      ['Goalie', 1],
    ]);
  });

  it('leaves the ranking it was given as it was', () => {
    ofKind(rows, 'goalie');

    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
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

/** A club's crease: each goalie by id (none for one the league has rostered) and his nightly shares. */
function crease(
  dates: readonly string[],
  goalies: [string | undefined, number[]][],
): PlannerCrease {
  return {
    team: 'NJD',
    goalies: goalies.map(([playerId, shares]) => ({
      ...(playerId === undefined ? {} : { playerId }),
      nights: shares.map((share, index) => ({ date: dates[index], share })),
    })),
  };
}

describe('projectedStarts', () => {
  const SATURDAY = ['2026-10-17'];
  const WEEK = ['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-18'];
  const all = (dates: readonly string[]) => new Set(dates);

  it("gives a club's one game to its likeliest starter and none to the man behind him", () => {
    // New Jersey's weekend: a little under half a start each, and a rostered third the rest.
    const starts = projectedStarts(
      [
        crease(SATURDAY, [
          ['allen', [0.48]],
          ['daws', [0.44]],
          [undefined, [0.08]],
        ]),
      ],
      all(SATURDAY),
      false,
    );

    expect(starts.get('allen')).toBe(1);
    expect(starts.get('daws')).toBe(0);
  });

  it('gives a free agent nothing behind a rostered goalie likelier to start', () => {
    const starts = projectedStarts(
      [
        crease(SATURDAY, [
          [undefined, [0.55]],
          ['backup', [0.45]],
        ]),
      ],
      all(SATURDAY),
      false,
    );

    expect(starts.get('backup')).toBe(0);
  });

  it('splits a week the way it is likeliest to go, not every night to the starter', () => {
    const shares = (share: number) => WEEK.map(() => share);
    const week = crease(WEEK, [
      ['starter', shares(0.7)],
      ['backup', shares(0.3)],
    ]);

    // Over four nights at seventy-thirty the backup's likeliest week is one start.
    const four = projectedStarts([week], all(WEEK), true);
    expect([four.get('starter'), four.get('backup')]).toEqual([3, 1]);
    // Over two it is none: both to the starter happens more often than a split.
    const two = projectedStarts([week], all(WEEK.slice(2)), false);
    expect([two.get('starter'), two.get('backup')]).toEqual([2, 0]);
  });

  it("reads each night's own shares, so a starter back from injury takes the nights after", () => {
    // Out until the Saturday: his backup has the first two nights to himself.
    const week = crease(WEEK, [
      ['starter', [0, 0, 0.75, 0.75]],
      ['backup', [1, 1, 0.25, 0.25]],
    ]);

    const weekend = projectedStarts([week], all(WEEK.slice(2)), false);
    expect([weekend.get('starter'), weekend.get('backup')]).toEqual([2, 0]);
    const midweek = projectedStarts([week], all(WEEK.slice(0, 2)), false);
    expect([midweek.get('starter'), midweek.get('backup')]).toEqual([0, 2]);
  });

  it('counts every night of the stretch while none is left out', () => {
    const week = crease(WEEK, [['starter', WEEK.map(() => 1)]]);

    expect(projectedStarts([week], new Set(), true).get('starter')).toBe(4);
    expect(projectedStarts([week], new Set(), false).get('starter')).toBe(0);
  });

  it('breaks a tie for the goalie listed first, who has the most starts over the stretch', () => {
    const starts = projectedStarts(
      [
        crease(SATURDAY, [
          ['first', [0.5]],
          ['second', [0.5]],
        ]),
      ],
      all(SATURDAY),
      false,
    );

    expect([starts.get('first'), starts.get('second')]).toEqual([1, 0]);
  });

  it('leaves a game to a goalie the model does not name when the shares fall short of it', () => {
    const starts = projectedStarts([crease(SATURDAY, [['lone', [0.3]]])], all(SATURDAY), false);

    expect(starts.get('lone')).toBe(0);
  });

  it('holds a crease whose shares run past one start to the one start a night has', () => {
    const starts = projectedStarts(
      [
        crease(SATURDAY, [
          ['incumbent', [0.7]],
          ['arrival', [0.6]],
        ]),
      ],
      all(SATURDAY),
      false,
    );

    expect([starts.get('incumbent'), starts.get('arrival')]).toEqual([1, 0]);
  });
});

describe('startsProjection', () => {
  const line = goalie({ gs: 2, w: 1.2, sv: 56, sa: 61, svPct: 0.918, gaa: 2.5, toi: 7200 });

  it('is his line a start at a time, times the starts he is given', () => {
    const one = startsProjection(line.projection, 2, 1);

    expect(one.stats.scoring).toMatchObject({ gs: 1, w: 0.6, sv: 28, svPct: 0.918, gaa: 2.5 });
    expect(one.stats.utility.gp).toBe(1);
  });

  it('is nought in every stat, the rates too, for a goalie given no start', () => {
    const none = startsProjection(line.projection, 2, 0);

    expect(Object.values(none.stats.scoring).every((value) => value === 0)).toBe(true);
    expect(none.stats.utility.gp).toBe(0);
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

  it('writes a goalie given no start as nought, with no rate', () => {
    const player = goalie({ w: 1.4, gaa: 2.613, svPct: 0.9084, sho: 0.12 });
    const row = { ...ranked(player, 1, startsProjection(player.projection, 2, 0)), games: 0 };

    expect(written(row)).toEqual(['0.0 W', '— GAA', '— SV%', '0.0 SHO']);
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

  it('writes games as a whole number, however fractional the expectation', () => {
    expect(formatGames(3)).toBe('3');
    expect(formatGames(2.97)).toBe('3');
    expect(formatGames(3.75)).toBe('4');
    expect(formatGames(2.49)).toBe('2');
  });
});
