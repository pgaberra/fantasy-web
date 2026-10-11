import { describe, it, expect } from 'vitest';
import { DraftRosterService } from './draft-roster.service';
import { Player } from '../models/player.model';
import { SkaterPosition } from '../models/position.model';
import { GoalieStats, SkaterStats } from '../models/projection.model';
import { RosterSlots } from '../api/models/roster-slots';

const service = new DraftRosterService();
const roster: RosterSlots = { c: 1, lw: 1, rw: 1, w: 0, f: 0, d: 2, util: 1, bn: 1, g: 1 };

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

describe('DraftRosterService', () => {
  it('places players into their position slot, overflowing to util then bench', () => {
    const players = new Map<number, Player>([
      [1, skater(1, ['C'])],
      [2, skater(2, ['C'])],
      [3, goalie(3)],
    ]);

    const result = service.deriveRoster([1, 2, 3], players, roster);

    expect(result.slots.find((slot) => slot.slotKey === 'c')?.playerId).toEqual(1);
    expect(result.slots.find((slot) => slot.slotKey === 'util')?.playerId).toEqual(2);
    expect(result.slots.find((slot) => slot.slotKey === 'g')?.playerId).toEqual(3);
    expect(result.unplaced).toEqual([]);
  });

  it('seats a skater in his own slot, then W, then F, then Util, then the bench', () => {
    const flex: RosterSlots = { c: 1, lw: 1, rw: 0, w: 1, f: 1, d: 1, util: 1, bn: 1, g: 0 };
    const players = new Map<number, Player>([
      [1, skater(1, ['LW'])],
      [2, skater(2, ['LW'])],
      [3, skater(3, ['C'])],
      [4, skater(4, ['C'])],
      [5, skater(5, ['RW'])],
      [6, skater(6, ['D'])],
      [7, skater(7, ['D'])],
    ]);

    const result = service.deriveRoster([1, 2, 3, 4, 5, 6, 7], players, flex);
    const seated = (key: keyof RosterSlots) =>
      result.slots.filter((slot) => slot.slotKey === key).map((slot) => slot.playerId);

    expect(seated('lw')).toEqual([1]);
    expect(seated('w')).toEqual([2]);
    expect(seated('c')).toEqual([3]);
    expect(seated('f')).toEqual([4]);
    // W and F are taken, so the next winger goes to Util and the second D to the bench.
    expect(seated('d')).toEqual([6]);
    expect(seated('util')).toEqual([5]);
    expect(seated('bn')).toEqual([7]);
    expect(result.unplaced).toEqual([]);
  });

  it('never seats a defenceman or a goalie in a forward flex slot', () => {
    const forwardsOnly: RosterSlots = {
      c: 0,
      lw: 0,
      rw: 0,
      w: 1,
      f: 9,
      d: 0,
      util: 0,
      bn: 0,
      g: 0,
    };
    const players = new Map<number, Player>([
      [1, skater(1, ['D'])],
      [2, goalie(2)],
    ]);

    const result = service.deriveRoster([1, 2], players, forwardsOnly);

    expect(result.slots.every((slot) => slot.playerId === null)).toEqual(true);
    expect(result.unplaced).toEqual([1, 2]);
  });

  it('lays the flex slots out after the named forward slots, labelled W and F', () => {
    const flex: RosterSlots = { c: 1, lw: 1, rw: 1, w: 1, f: 2, d: 1, util: 0, bn: 0, g: 1 };

    const result = service.deriveRoster([], new Map(), flex);

    expect(result.slots.map((slot) => slot.label)).toEqual([
      'C',
      'LW',
      'RW',
      'W',
      'F',
      'F',
      'D',
      'G',
    ]);
  });

  it('reports players that do not fit any slot as unplaced', () => {
    const tight: RosterSlots = { c: 1, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 0, bn: 0, g: 0 };
    const players = new Map<number, Player>([
      [1, skater(1, ['C'])],
      [2, skater(2, ['C'])],
    ]);

    const result = service.deriveRoster([1, 2], players, tight);

    expect(result.slots.find((slot) => slot.slotKey === 'c')?.playerId).toEqual(1);
    expect(result.unplaced).toEqual([2]);
  });
});
