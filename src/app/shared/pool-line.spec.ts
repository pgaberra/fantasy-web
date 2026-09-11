import { describe, expect, it } from 'vitest';
import { Goalie, Skater } from '../models/player.model';
import { GoalieProjection, SkaterProjection } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { ownLine, squaredWithPool } from './pool-line';

describe('pool-line', () => {
  const zeros = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 0]));

  const skater: Skater = {
    type: 'skater',
    id: 1,
    name: 'A Centre',
    positions: new Set(['C']),
    stats: {
      utility: { gp: 82, toiPerGame: 1200 },
      scoring: { ...zeros(SKATER_SCORING_STAT_KEYS), goals: 30 } as Skater['stats']['scoring'],
    },
  };

  const goalie: Goalie = {
    type: 'goalie',
    id: 2,
    name: 'A Goalie',
    stats: {
      utility: { gp: 50 },
      scoring: { ...zeros(GOALIE_SCORING_STAT_KEYS), w: 30 } as Goalie['stats']['scoring'],
    },
  };

  it("starts a player from their own line, of the pool's kind", () => {
    expect(ownLine(skater)).toEqual({ type: 'skater', playerId: 1, stats: skater.stats });
    expect(ownLine(goalie)).toEqual({ type: 'goalie', playerId: 2, stats: goalie.stats });
  });

  it('keeps a line of the same kind as the pool, edits and all', () => {
    const edited: SkaterProjection = {
      ...(ownLine(skater) as SkaterProjection),
      stats: { ...skater.stats, scoring: { ...skater.stats.scoring, goals: 45 } },
    };
    expect(squaredWithPool(edited, skater)).toBe(edited);
  });

  it('restarts a line of the other kind from the pool', () => {
    const goalieLineForTheCentre: GoalieProjection = {
      type: 'goalie',
      playerId: 1,
      stats: goalie.stats,
    };
    expect(squaredWithPool(goalieLineForTheCentre, skater)).toEqual(ownLine(skater));
  });

  it('leaves a line alone when the pool does not hold the player', () => {
    const line = ownLine(goalie);
    expect(squaredWithPool(line, undefined)).toBe(line);
  });
});
