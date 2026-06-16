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
      ...Object.fromEntries(SKATER_SCORING_STAT_KEYS.map((key) => [key, 0])),
      ...scoring,
    } as Record<SkaterScoringStatKey, number>,
    utility: { gp: 82, toiPerGame: 1200 },
  },
});

const goalie = (
  playerId: number,
  scoring: Partial<Record<GoalieScoringStatKey, number>>,
): GoalieProjection => ({
  type: 'goalie',
  playerId,
  stats: {
    scoring: {
      ...Object.fromEntries(GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0])),
      ...scoring,
    } as Record<GoalieScoringStatKey, number>,
    utility: { gp: 60 },
  },
});

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
