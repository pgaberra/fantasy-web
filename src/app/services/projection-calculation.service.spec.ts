import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectionCalculationService } from './projection-calculation.service';
import { GoalieProjection, SkaterProjection } from '../models/projection.model';
import {
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SkaterScoringStatKey,
  GOALIE_SCORING_STAT_KEYS,
  GoalieScoringStatKey,
} from '../models/stat-key.model';

const skater = (
  playerId: number,
  scoring: Partial<Record<SkaterScoringStatKey, number>>,
): SkaterProjection => ({
  type: 'skater',
  playerId,
  stats: {
    scoring: {
      stpg: 0,
      stpa: 0,
      stp: 0,
      hatTricks: 0,
      defPoints: 0,
      shifts: 0,
      toi: 0,
      ...Object.fromEntries(SKATER_SCORING_STAT_KEYS.map((key) => [key, 0])),
      ...scoring,
    } as Record<SkaterScoringStatKey, number>,
    utility: { gp: 82, toiPerGame: 1200 },
  },
});

const goalie = (
  playerId: number,
  scoring: Partial<Record<GoalieScoringStatKey, number>>,
  gp = 60,
): GoalieProjection => ({
  type: 'goalie',
  playerId,
  stats: {
    scoring: {
      stpg: 0,
      stpa: 0,
      stp: 0,
      hatTricks: 0,
      defPoints: 0,
      shifts: 0,
      toi: 0,
      ...Object.fromEntries(GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0])),
      ...scoring,
    } as Record<GoalieScoringStatKey, number>,
    utility: { gp },
  },
});

/** A goalie's season whose counts agree with his rates, at a full sixty minutes a game. */
const goalieSeason = (
  playerId: number,
  gp: number,
  gaa: number,
  svPct: number,
): GoalieProjection => {
  const ga = gaa * gp;
  const sa = ga / (1 - svPct);
  return goalie(playerId, { gs: gp, toi: gp * 3600, ga, gaa, sa, sv: sa - ga, svPct }, gp);
};

const GOALIE_RATIOS = new Set<ScoringStatKey>(['gaa', 'svPct']);

describe('ProjectionCalculationService.computeZScores', () => {
  let service: ProjectionCalculationService;

  beforeEach(() => {
    service = new ProjectionCalculationService();
  });

  it('standardizes an active category across the skater pool', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 10 }), skater(2, { goals: 20 })],
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result[0]).toBeCloseTo(-1);
    expect(result[1]).toBeCloseTo(1);
  });

  it('weights every active category equally, regardless of any stat weight', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 10, assists: 10 }), skater(2, { goals: 20, assists: 20 })],
      new Set<ScoringStatKey>(['goals', 'assists']),
    );

    expect(result[0]).toBeCloseTo(-2);
    expect(result[1]).toBeCloseTo(2);
  });

  it('inverts a lower-is-better category so the lower value scores higher', () => {
    const result = service.computeZScores(
      [goalie(1, { gaa: 2.0 }), goalie(2, { gaa: 3.0 })],
      new Set<ScoringStatKey>(['gaa']),
    );

    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(-1);
  });

  it('standardizes skater and goalie categories in separate pools', () => {
    const result = service.computeZScores(
      [
        skater(1, { goals: 10 }),
        skater(2, { goals: 20 }),
        goalie(3, { w: 30 }),
        goalie(4, { w: 40 }),
      ],
      new Set<ScoringStatKey>(['goals', 'w']),
    );

    expect(result[0]).toBeCloseTo(-1);
    expect(result[1]).toBeCloseTo(1);
    expect(result[2]).toBeCloseTo(-1);
    expect(result[3]).toBeCloseTo(1);
  });

  it('ignores inactive categories', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 10, assists: 100 }), skater(2, { goals: 20, assists: 0 })],
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result[0]).toBeCloseTo(-1);
    expect(result[1]).toBeCloseTo(1);
  });

  it('contributes nothing for a category with no spread', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 15 }), skater(2, { goals: 15 })],
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result[0]).toEqual(0);
    expect(result[1]).toEqual(0);
  });

  it('returns an empty array for no projections', () => {
    const result = service.computeZScores([], new Set(['goals']));

    expect(result.length).toEqual(0);
  });

  it('honors an explicit skater pool size', () => {
    const elite = [
      skater(1, { goals: 50 }),
      skater(2, { goals: 40 }),
      skater(3, { goals: 30 }),
      skater(4, { goals: 20 }),
      skater(5, { goals: 10 }),
    ];
    const fringe = Array.from({ length: 175 }, (_unused, index) =>
      skater(1000 + index, { goals: 0 }),
    );
    const field = [...elite, ...fringe];

    const fullPool = service.computeZScores(field, new Set(['goals']), 180, 32);
    const smallPool = service.computeZScores(field, new Set(['goals']), 30, 32);

    expect(smallPool[0]).not.toBeCloseTo(fullPool[0], 5);
  });

  it('defaults to the standard pool sizes when none are given', () => {
    const field = [skater(1, { goals: 10 }), skater(2, { goals: 20 })];

    expect(service.computeZScores(field, new Set(['goals']))).toEqual(
      service.computeZScores(field, new Set(['goals']), 180, 32),
    );
  });

  it('caps the standardization baseline at the pool size, ignoring the fringe', () => {
    const elite = [
      skater(1, { goals: 50 }),
      skater(2, { goals: 40 }),
      skater(3, { goals: 30 }),
      skater(4, { goals: 20 }),
      skater(5, { goals: 10 }),
    ];
    const fringe = (count: number): SkaterProjection[] =>
      Array.from({ length: count }, (_unused, index) => skater(1000 + index, { goals: 0 }));

    const smallField = service.computeZScores([...elite, ...fringe(175)], new Set(['goals']));
    const largeField = service.computeZScores([...elite, ...fringe(400)], new Set(['goals']));

    expect(largeField[0]).toBeCloseTo(smallField[0], 5);
    expect(largeField[0]).toBeGreaterThan(0);
  });
});

describe('ProjectionCalculationService ratio categories', () => {
  let service: ProjectionCalculationService;

  beforeEach(() => {
    service = new ProjectionCalculationService();
  });

  // Two goalies with the same good numbers, one playing twice the other's games, and two worse ones
  // to set the pool's rate below theirs.
  const field = (): GoalieProjection[] => [
    goalieSeason(1, 60, 2.4, 0.918),
    goalieSeason(2, 30, 2.4, 0.918),
    goalieSeason(3, 55, 3.1, 0.898),
    goalieSeason(4, 45, 2.9, 0.903),
  ];

  it('ranks a 60-game goalie above a 30-game goalie with the same GAA and save percentage', () => {
    const [starter, backup] = service.computeZScores(field(), GOALIE_RATIOS);

    expect(backup).toBeGreaterThan(0);
    expect(starter).toBeGreaterThan(backup);
    // Goals prevented and saves above average both scale with the minutes and shots behind them.
    expect(starter / backup).toBeCloseTo(2, 5);
  });

  it('ranks a busy below-average goalie below a light one with the same numbers', () => {
    const scores = service.computeZScores(
      [...field(), goalieSeason(5, 25, 3.1, 0.898)],
      GOALIE_RATIOS,
    );

    expect(scores[2]).toBeLessThan(scores[4]);
    expect(scores[4]).toBeLessThan(0);
  });

  it('keeps the per-category contributions summing to the ranked total', () => {
    const projections = field().map((line, index) =>
      goalie(line.playerId, { ...line.stats.scoring, w: [36, 17, 24, 22][index] }, 60),
    );
    const categories = new Set<ScoringStatKey>(['w', 'gaa', 'svPct']);

    const totals = service.computeZScores(projections, categories);
    const contributions = service.computeZScoreContributions(projections, categories);

    contributions.forEach((byCategory, index) => {
      expect(new Set(Object.keys(byCategory))).toEqual(new Set(['w', 'gaa', 'svPct']));
      const sum = Object.values(byCategory).reduce((total, value) => total + value, 0);
      expect(sum).toBeCloseTo(totals[index], 10);
    });
  });

  it('turns GAA round so the goalie who concedes less scores higher', () => {
    const contributions = service.computeZScoreContributions(field(), GOALIE_RATIOS);

    expect(contributions[0]['gaa']).toBeGreaterThan(0);
    expect(contributions[2]['gaa']).toBeLessThan(0);
  });

  it('ranks a line with no time on ice or shots against as one that has them', () => {
    const complete = field();
    const bare = complete.map((line) =>
      goalie(
        line.playerId,
        { gaa: line.stats.scoring.gaa, svPct: line.stats.scoring.svPct },
        line.stats.utility.gp,
      ),
    );

    const fromCounts = service.computeZScoreContributions(complete, GOALIE_RATIOS);
    const derived = service.computeZScoreContributions(bare, GOALIE_RATIOS);

    derived.forEach((byCategory, index) => {
      expect(byCategory['gaa']).toBeCloseTo(fromCounts[index]['gaa'], 10);
      expect(byCategory['svPct']).toBeCloseTo(fromCounts[index]['svPct'], 10);
    });
  });

  it('takes the shots against from saves and save percentage when the line has no shots', () => {
    const complete = field();
    const withoutShots = complete.map((line) =>
      goalie(line.playerId, { ...line.stats.scoring, sa: 0, ga: 0 }, line.stats.utility.gp),
    );

    expect(service.computeZScores(withoutShots, new Set(['svPct']))).toEqual(
      service
        .computeZScores(complete, new Set(['svPct']))
        .map((score) => expect.closeTo(score, 10)),
    );
  });

  it('adds nothing to a ratio for a goalie who never plays', () => {
    const contributions = service.computeZScoreContributions(
      [...field(), goalie(5, {}, 0)],
      GOALIE_RATIOS,
    );

    // Before, his GAA of zero was the best in the league.
    expect(contributions[4]['gaa']).toBeCloseTo(0, 10);
    expect(contributions[4]['svPct']).toBeCloseTo(0, 10);
  });

  it("weighs a rate with no games behind it at the pool's average volume", () => {
    const rateOnly = goalie(5, { gaa: 2.4, svPct: 0.918 }, 0);
    const scores = service.computeZScores([...field(), rateOnly], GOALIE_RATIOS);

    expect(scores[4]).toBeGreaterThan(0);
    expect(scores[4]).toBeLessThan(scores[0]);
  });

  it('measures the pool rate by volume rather than as a mean of the rates', () => {
    // Weighted by hours the pool concedes 2.8 a game, where the mean of the three GAAs is 2.6. The
    // goalie who sits at 2.8 is then exactly average, where a mean of the rates would mark him down.
    const contributions = service.computeZScoreContributions(
      [goalieSeason(1, 60, 3.0, 0.9), goalieSeason(2, 15, 2.0, 0.9), goalieSeason(3, 30, 2.8, 0.9)],
      new Set(['gaa']),
    );

    expect(contributions[2]['gaa']).toBeCloseTo(0, 10);
    expect(contributions[0]['gaa']).toBeLessThan(0);
    expect(contributions[1]['gaa']).toBeGreaterThan(0);
  });

  it('contributes nothing for a ratio the whole pool shares', () => {
    const contributions = service.computeZScoreContributions(
      [goalieSeason(1, 60, 2.7, 0.91), goalieSeason(2, 30, 2.7, 0.91)],
      GOALIE_RATIOS,
    );

    expect(contributions).toEqual([{}, {}]);
  });

  it('weights win percentage by decisions', () => {
    const scores = service.computeZScores(
      [
        goalie(1, { w: 36, l: 18, otl: 6, winPct: 0.6 }),
        goalie(2, { w: 18, l: 9, otl: 3, winPct: 0.6 }),
        goalie(3, { w: 20, l: 25, otl: 5, winPct: 0.4 }),
      ],
      new Set(['winPct']),
    );

    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(0);
  });

  it('weights shooting percentage by shots on goal', () => {
    const scores = service.computeZScores(
      [
        skater(1, { goals: 30, sog: 200, shPct: 15 }),
        skater(2, { goals: 6, sog: 40, shPct: 15 }),
        skater(3, { goals: 16, sog: 200, shPct: 8 }),
      ],
      new Set(['shPct']),
    );

    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(0);
  });

  it('leaves counting categories scored as they stand', () => {
    const wins = [36, 17, 24, 22];
    const lines = field().map((line, index) =>
      goalie(line.playerId, { ...line.stats.scoring, w: wins[index] }, line.stats.utility.gp),
    );
    const mean = wins.reduce((total, value) => total + value, 0) / wins.length;
    const stdDev = Math.sqrt(
      wins.reduce((total, value) => total + (value - mean) ** 2, 0) / wins.length,
    );

    const contributions = service.computeZScoreContributions(
      lines,
      new Set<ScoringStatKey>(['w', 'gaa', 'svPct']),
    );

    contributions.forEach((byCategory, index) => {
      expect(byCategory['w']).toBeCloseTo((wins[index] - mean) / stdDev, 10);
    });
  });
});
