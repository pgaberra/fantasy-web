import { describe, it, expect } from 'vitest';
import { deriveRoster } from './draft-roster';
import { Player } from '../models/player.model';
import { SkaterPosition } from '../models/position.model';
import { GoalieStats, SkaterStats } from '../models/projection.model';
import { RosterSlots } from '../api/models/roster-slots';

const roster: RosterSlots = { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 1, g: 1 };

function skater(id: number, positions: SkaterPosition[]): Player {
  return {
    id,
    type: 'skater',
    name: `S${id}`,
    positions: new Set(positions),
    stats: {} as SkaterStats,
  };
}

function goalie(id: number): Player {
  return { id, type: 'goalie', name: `G${id}`, stats: {} as GoalieStats };
}

describe('deriveRoster', () => {
  it('places players into their position slot, overflowing to util then bench', () => {
    const players = new Map<number, Player>([
      [1, skater(1, ['C'])],
      [2, skater(2, ['C'])],
      [3, goalie(3)],
    ]);

    const result = deriveRoster([1, 2, 3], players, roster);

    expect(result.slots.find((slot) => slot.slotKey === 'c')?.playerId).toEqual(1);
    expect(result.slots.find((slot) => slot.slotKey === 'util')?.playerId).toEqual(2);
    expect(result.slots.find((slot) => slot.slotKey === 'g')?.playerId).toEqual(3);
    expect(result.unplaced).toEqual([]);
  });

  it('reports players that do not fit any slot as unplaced', () => {
    const tight: RosterSlots = { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 };
    const players = new Map<number, Player>([
      [1, skater(1, ['C'])],
      [2, skater(2, ['C'])],
    ]);

    const result = deriveRoster([1, 2], players, tight);

    expect(result.slots.find((slot) => slot.slotKey === 'c')?.playerId).toEqual(1);
    expect(result.unplaced).toEqual([2]);
  });
});
