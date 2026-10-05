import { describe, expect, it } from 'vitest';
import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { lineupSeats } from './planner-lineup';
import {
  bestSwap,
  openRosterSpot,
  parked,
  startersOn,
  suggestedDrops,
  swapContext,
  swapOver,
  SwapSkater,
} from './planner-swap';

const NONE: RosterSlots = { c: 0, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 0, bn: 0, g: 0 };

const MON = '2026-10-12';
const TUE = '2026-10-13';
const THU = '2026-10-15';
const WEEK = [MON, TUE, THU];

function skater(name: string, positions: string[], nights: string[], value: number): SwapSkater {
  return { playerId: name, name, positions, nights: new Set(nights), value };
}

/** A C, a RW and a D start; Monday is an off-night for the team, Tuesday is full. */
const SEATS = lineupSeats({ ...NONE, c: 1, rw: 1, d: 1, bn: 2 });

describe('startersOn', () => {
  it('starts the most valuable players the seats can hold, not just as many as fit', () => {
    const playing = [
      skater('Cheap Wing', ['RW'], [MON], 1),
      skater('Dual', ['C', 'RW'], [MON], 3),
      skater('Center', ['C'], [MON], 2),
    ];

    // Dual moves to RW so the C can start too; the cheap wing sits.
    expect(startersOn(playing, SEATS).map((player) => player.name)).toEqual(['Dual', 'Center']);
  });
});

describe('swapOver', () => {
  const kakko = skater('Kakko', ['RW'], [TUE], 2);
  const team = [skater('Center', ['C'], [MON, TUE], 3), kakko, skater('Dman', ['D'], [TUE], 2)];
  const context = swapContext(team, SEATS, WEEK);

  it('counts the seat the dropped player frees: Blake for Kakko is a game gained, not none', () => {
    const blake = skater('Blake', ['RW'], [MON, TUE], 2.5);

    const swap = swapOver(context, blake, kakko);

    expect(swap.games).toBe(1);
    expect(swap.value).toBeCloseTo(3, 10);
    expect(swap.nights).toEqual([
      { date: MON, games: 1, value: 2.5, started: ['Blake'], sat: [] },
      { date: TUE, games: 0, value: 0.5, started: ['Blake'], sat: ['Kakko'] },
      { date: THU, games: 0, value: 0, started: [], sat: [] },
    ]);
  });

  it("weighs each game by what a game of the player's is worth, not by the count alone", () => {
    const poor = skater('Poor Wing', ['RW'], [MON, TUE], 0.5);

    const swap = swapOver(context, poor, kakko);

    // Two of his games for one of Kakko's is a game more and still a loss.
    expect(swap.games).toBe(1);
    expect(swap.value).toBeCloseTo(-1, 10);
  });

  it("gives the dropped player's seat to a teammate on the bench", () => {
    const bench = skater('Bench Wing', ['RW'], [TUE], 1);
    const deep = swapContext([...team, bench], SEATS, WEEK);
    const mondayOnly = skater('Monday Wing', ['RW'], [MON], 2);

    const swap = swapOver(deep, mondayOnly, kakko);

    expect(swap.nights[1]).toEqual({
      date: TUE,
      games: 0,
      value: -1,
      started: ['Bench Wing'],
      sat: ['Kakko'],
    });
    expect(swap.value).toBeCloseTo(1, 10);
  });

  it('frees no seat by dropping a player who sat that night anyway', () => {
    const bench = skater('Bench Wing', ['RW'], [TUE], 1);
    const deep = swapContext([...team, bench], SEATS, WEEK);
    const tuesdayOnly = skater('Tuesday Wing', ['RW'], [TUE], 1.5);

    const swap = swapOver(deep, tuesdayOnly, bench);

    // Kakko keeps the RW seat; the pickup sits where the bench wing sat.
    expect(swap.games).toBe(0);
    expect(swap.value).toBe(0);
  });

  it('into an open roster spot costs nobody', () => {
    const blake = skater('Blake', ['RW'], [MON, TUE], 2.5);

    const swap = swapOver(context, blake, null);

    expect(swap.drop).toBeNull();
    // Monday is a game more; Tuesday Blake takes the RW seat and Kakko, worth less, sits.
    expect(swap.games).toBe(1);
    expect(swap.value).toBeCloseTo(3, 10);
    expect(swap.nights[1].sat).toEqual(['Kakko']);
  });
});

describe('bestSwap', () => {
  const kakko = skater('Kakko', ['RW'], [TUE], 2);
  const dman = skater('Dman', ['D'], [TUE], 2);
  const team = [skater('Center', ['C'], [MON, TUE], 3), kakko, dman];
  const context = swapContext(team, SEATS, WEEK);
  const blake = skater('Blake', ['RW'], [MON, TUE], 2.5);

  it('takes the drop that gains the team most', () => {
    // Dropping the D empties his seat on Tuesday; dropping Kakko gives Blake his.
    expect(bestSwap(context, blake, [dman, kakko], false)?.drop).toBe(kakko);
  });

  it('takes an open roster spot when it beats every drop', () => {
    const swap = bestSwap(context, blake, [dman], true);

    expect(swap?.drop).toBeNull();
  });

  it('has none with no open spot and nobody to drop', () => {
    expect(bestSwap(context, blake, [], false)).toBeNull();
  });
});

function rostered(slot?: string): PlannerRosterPlayer {
  return { playerId: 'x', name: 'x', type: 'skater', positions: ['C'], out: false, slot };
}

describe('the roster', () => {
  it('holds no roster spot on injured reserve or not active', () => {
    expect(parked(rostered('IR+'))).toBe(true);
    expect(parked(rostered('na'))).toBe(true);
    expect(parked(rostered('BN'))).toBe(false);
    expect(parked(rostered())).toBe(false);
  });

  it('has an open spot while fewer players hold one than the lineup and bench seat', () => {
    const slots = { ...NONE, c: 1, bn: 1 };

    expect(openRosterSpot([rostered('C')], slots)).toBe(true);
    expect(openRosterSpot([rostered('C'), rostered('BN')], slots)).toBe(false);
    expect(openRosterSpot([rostered('C'), rostered('IR')], slots)).toBe(true);
  });

  it('suggests the skaters whose games are worth least, never one the model has no line for', () => {
    const team = [
      skater('Star', ['C'], [], 5),
      skater('Unknown', ['C'], [], 0),
      skater('Depth', ['C'], [], 1),
      skater('Grinder', ['C'], [], 0.5),
    ];

    expect(suggestedDrops(team, (player) => player.name !== 'Unknown', 2)).toEqual([
      'Grinder',
      'Depth',
    ]);
  });
});
