import { describe, expect, it } from 'vitest';
import { applyPositionOverrides } from './position-override';
import { Goalie, Player, Skater } from './player.model';
import { SkaterPosition } from './position.model';

function skater(id: number, positions: SkaterPosition[]): Skater {
  return {
    type: 'skater',
    id,
    name: `Skater ${id}`,
    positions: new Set(positions),
    stats: { utility: {}, scoring: {} } as Skater['stats'],
  };
}

function goalie(id: number): Goalie {
  return {
    type: 'goalie',
    id,
    name: `Goalie ${id}`,
    stats: { utility: {}, scoring: {} } as Goalie['stats'],
  };
}

describe('applyPositionOverrides', () => {
  const pool: Player[] = [skater(1, ['LW', 'RW']), skater(2, ['C']), goalie(3)];

  it('replaces the reported positions with the ones the owner set', () => {
    const corrected = applyPositionOverrides(pool, new Map([[1, ['LW']]]));

    expect([...(corrected[0] as Skater).positions]).toEqual(['LW']);
  });

  it('leaves every player the owner did not correct alone', () => {
    const corrected = applyPositionOverrides(pool, new Map([[1, ['LW']]]));

    expect(corrected[1]).toBe(pool[1]);
    expect(corrected[2]).toBe(pool[2]);
  });

  /** The pool is ~1600 players and this runs on every read of it. */
  it('hands back the same pool when nothing has been corrected', () => {
    expect(applyPositionOverrides(pool, new Map())).toBe(pool);
  });

  /** A correction can outlive the player it was written for: the pool changes all season. */
  it('ignores a correction for a player the pool no longer has', () => {
    const corrected = applyPositionOverrides(pool, new Map([[99, ['D']]]));

    expect(corrected.map((player) => player.id)).toEqual([1, 2, 3]);
  });
});
