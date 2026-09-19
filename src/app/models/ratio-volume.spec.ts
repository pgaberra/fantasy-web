import { describe, it, expect } from 'vitest';
import { ratioVolume } from './ratio-volume';
import { GoalieProjection, SkaterProjection } from './projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  GoalieScoringStatKey,
  RATE_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SkaterScoringStatKey,
} from './stat-key.model';

const skater = (scoring: Partial<Record<SkaterScoringStatKey, number>>): SkaterProjection => ({
  type: 'skater',
  playerId: 1,
  stats: {
    scoring: {
      ...Object.fromEntries(SKATER_SCORING_STAT_KEYS.map((key) => [key, 0])),
      ...scoring,
    } as Record<SkaterScoringStatKey, number>,
    utility: { gp: 82, toiPerGame: 1200 },
  },
});

const goalie = (
  scoring: Partial<Record<GoalieScoringStatKey, number>>,
  gp = 0,
): GoalieProjection => ({
  type: 'goalie',
  playerId: 2,
  stats: {
    scoring: {
      ...Object.fromEntries(GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0])),
      ...scoring,
    } as Record<GoalieScoringStatKey, number>,
    utility: { gp },
  },
});

describe('ratioVolume', () => {
  it('gives every rate stat a volume for skaters or for goalies', () => {
    for (const key of RATE_STAT_KEYS) {
      const forSkater = ratioVolume(skater({}), key) !== null;
      const forGoalie = ratioVolume(goalie({}), key) !== null;
      expect(forSkater !== forGoalie).toEqual(true);
    }
  });

  it('has no volume for a counting stat', () => {
    expect(ratioVolume(goalie({ w: 30 }), 'w')).toEqual(null);
    expect(ratioVolume(skater({ goals: 30 }), 'goals')).toEqual(null);
    expect(ratioVolume(goalie({ toi: 3600 }), 'shPct')).toEqual(null);
  });

  describe('GAA, weighed by hours in net', () => {
    it('reads them off the time on ice, in seconds', () => {
      expect(ratioVolume(goalie({ toi: 180_000, ga: 120, gaa: 2.4 }, 55), 'gaa')).toEqual(50);
    });

    it('derives them from goals against and GAA without a time on ice', () => {
      expect(ratioVolume(goalie({ ga: 120, gaa: 2.4 }, 55), 'gaa')).toEqual(50);
    });

    it('counts a full sixty minutes a game with neither', () => {
      expect(ratioVolume(goalie({ gaa: 2.4 }, 55), 'gaa')).toEqual(55);
    });

    it('is zero for a goalie with no games', () => {
      expect(ratioVolume(goalie({ gaa: 2.4 }), 'gaa')).toEqual(0);
    });
  });

  describe('save percentage, weighed by shots against', () => {
    it('reads them off the line', () => {
      expect(ratioVolume(goalie({ sa: 1500, sv: 1380, svPct: 0.92 }), 'svPct')).toEqual(1500);
    });

    it('derives them from saves and save percentage', () => {
      expect(ratioVolume(goalie({ sv: 1380, svPct: 0.92 }), 'svPct')).toBeCloseTo(1500, 10);
    });

    it('derives them from goals against and save percentage', () => {
      expect(ratioVolume(goalie({ ga: 120, svPct: 0.92 }), 'svPct')).toBeCloseTo(1500, 10);
    });

    it('derives them from GAA, games and save percentage as a last resort', () => {
      expect(ratioVolume(goalie({ gaa: 2.4, svPct: 0.92 }, 50), 'svPct')).toBeCloseTo(1500, 10);
    });

    it('takes a save percentage of zero for one never filled in, naming no shots', () => {
      expect(ratioVolume(goalie({ ga: 120 }, 50), 'svPct')).toEqual(0);
    });
  });

  describe('win percentage, weighed by decisions', () => {
    it('counts wins, losses and overtime losses', () => {
      expect(ratioVolume(goalie({ w: 30, l: 15, otl: 5, gs: 55 }, 58), 'winPct')).toEqual(50);
    });

    it('falls back to games started, then games played', () => {
      expect(ratioVolume(goalie({ winPct: 0.6, gs: 55 }, 58), 'winPct')).toEqual(55);
      expect(ratioVolume(goalie({ winPct: 0.6 }, 58), 'winPct')).toEqual(58);
    });
  });

  describe('shooting percentage, weighed by shots on goal', () => {
    it('reads them off the line', () => {
      expect(ratioVolume(skater({ sog: 200, goals: 30, shPct: 15 }), 'shPct')).toEqual(200);
    });

    it('derives them from goals and shooting percentage', () => {
      expect(ratioVolume(skater({ goals: 30, shPct: 15 }), 'shPct')).toBeCloseTo(200, 10);
    });

    it('is zero for a skater with no shots and no goals', () => {
      expect(ratioVolume(skater({}), 'shPct')).toEqual(0);
    });
  });
});
