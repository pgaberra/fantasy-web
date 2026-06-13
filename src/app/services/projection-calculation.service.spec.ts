import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectionCalculationService } from './projection-calculation.service';
import { GoalieProjection, SkaterProjection, StatWeights } from '../models/projection.model';
import {
  SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SkaterScoringStatKey,
  GOALIE_SCORING_STAT_KEYS,
  GoalieScoringStatKey,
} from '../models/stat-key.model';

const weightsWith = (overrides: Partial<Record<ScoringStatKey, number>>): StatWeights =>
  ({
    ...Object.fromEntries(SCORING_STAT_KEYS.map((key) => [key, 0])),
    ...overrides,
  }) as StatWeights;

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

  it('standardizes an active category across the skater pool, weighted', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 10 }), skater(2, { goals: 20 })],
      weightsWith({ goals: 1 }),
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result.get(1)).toBeCloseTo(-1);
    expect(result.get(2)).toBeCloseTo(1);
  });

  it('inverts the direction for a negatively weighted category', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 10 }), skater(2, { goals: 20 })],
      weightsWith({ goals: -1 }),
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result.get(1)).toBeCloseTo(1);
    expect(result.get(2)).toBeCloseTo(-1);
  });

  it('standardizes skater and goalie categories in separate pools', () => {
    const result = service.computeZScores(
      [
        skater(1, { goals: 10 }),
        skater(2, { goals: 20 }),
        goalie(3, { w: 30 }),
        goalie(4, { w: 40 }),
      ],
      weightsWith({ goals: 1, w: 1 }),
      new Set<ScoringStatKey>(['goals', 'w']),
    );

    expect(result.get(1)).toBeCloseTo(-1);
    expect(result.get(2)).toBeCloseTo(1);
    expect(result.get(3)).toBeCloseTo(-1);
    expect(result.get(4)).toBeCloseTo(1);
  });

  it('ignores inactive and zero-weight categories', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 10, assists: 100 }), skater(2, { goals: 20, assists: 0 })],
      weightsWith({ goals: 1, assists: 5 }),
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result.get(1)).toBeCloseTo(-1);
    expect(result.get(2)).toBeCloseTo(1);
  });

  it('contributes nothing for a category with no spread', () => {
    const result = service.computeZScores(
      [skater(1, { goals: 15 }), skater(2, { goals: 15 })],
      weightsWith({ goals: 1 }),
      new Set<ScoringStatKey>(['goals']),
    );

    expect(result.get(1)).toEqual(0);
    expect(result.get(2)).toEqual(0);
  });

  it('returns an empty map for no projections', () => {
    const result = service.computeZScores([], weightsWith({ goals: 1 }), new Set(['goals']));

    expect(result.size).toEqual(0);
  });
});
