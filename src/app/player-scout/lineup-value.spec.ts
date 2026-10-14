import { describe, expect, it } from 'vitest';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamPlayer } from '../services/player-scout.service';
import { NO_ROOM } from './drop-candidates';
import { swapInto, valueLineup } from './lineup-value';

/** Two centre seats, one wing, one defence seat, a goalie seat and a bench. */
const SLOTS: RosterSlots = { c: 2, lw: 1, rw: 0, w: 0, f: 0, d: 1, util: 0, bn: 2, g: 1 };

/** Every club plays the same ten nights, so the lineup is the whole question. */
const NIGHTS = Array.from(
  { length: 10 },
  (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`,
);

function schedule(
  clubs: Record<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(Object.entries(clubs));
}

function player(
  playerId: string,
  positions: string[],
  teamAbbrev = 'EDM',
  extra: Partial<TeamPlayer> = {},
): TeamPlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    teamAbbrev,
    type: positions.includes('G') ? 'goalie' : 'skater',
    positions,
    reserve: false,
    reserveEligible: [],
    out: false,
    projection: null,
    ...extra,
  };
}

describe('valueLineup', () => {
  // Five centres on one club, two centre seats: the third centre starts nowhere.
  const centres = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => player(id, ['C']));
  const scores: Record<string, number> = { c1: 100, c2: 80, c3: 60, c4: 40, c5: 20 };

  it('starts only as many of a kind as the lineup seats, the best of them', () => {
    const valuation = valueLineup(centres, SLOTS, schedule({ EDM: NIGHTS }), (id) => scores[id]);

    expect(valuation.byPlayer.get('c1')?.starts).toBe(10);
    expect(valuation.byPlayer.get('c2')?.starts).toBe(10);
    expect(valuation.byPlayer.get('c3')?.starts).toBe(0);
    expect(valuation.byPlayer.get('c3')?.games).toBe(10);
    // The team is worth its two starters: 100 and 80 over the ten nights.
    expect(valuation.total).toBeCloseTo(180);
  });

  it('costs the lineup only what the next man up does not replace', () => {
    const valuation = valueLineup(centres, SLOTS, schedule({ EDM: NIGHTS }), (id) => scores[id]);

    // Without c1, c3 starts in his place: the lineup loses 100 and gains 60.
    expect(valuation.byPlayer.get('c1')?.marginal).toBeCloseTo(40);
    expect(valuation.byPlayer.get('c2')?.marginal).toBeCloseTo(20);
    // The third centre is worth nothing to the lineup, whatever he would score on the bench.
    expect(valuation.byPlayer.get('c3')?.marginal).toBe(0);
    expect(valuation.byPlayer.get('c3')?.value).toBe(0);
  });

  it('seats a lone defenceman every night his club plays, and a goalie in the crease', () => {
    const team = [player('d1', ['D'], 'COL'), player('g1', ['G'], 'BOS')];
    const valuation = valueLineup(
      team,
      SLOTS,
      schedule({ COL: NIGHTS.slice(0, 4), BOS: NIGHTS.slice(0, 6) }),
      (id) => ({ d1: 20, g1: 30 })[id] ?? null,
    );

    expect(valuation.byPlayer.get('d1')).toMatchObject({
      starts: 4,
      games: 4,
      value: 20,
      marginal: 20,
    });
    expect(valuation.byPlayer.get('g1')).toMatchObject({
      starts: 6,
      games: 6,
      value: 30,
      marginal: 30,
    });
  });

  it('lets a player play on the nights another is off, so two clubs share one seat', () => {
    const team = [player('d1', ['D'], 'COL'), player('d2', ['D'], 'BOS')];
    const valuation = valueLineup(
      team,
      SLOTS,
      // COL plays the first six nights, BOS the last six: two nights clash.
      schedule({ COL: NIGHTS.slice(0, 6), BOS: NIGHTS.slice(4) }),
      (id) => ({ d1: 60, d2: 30 })[id] ?? null,
    );

    expect(valuation.byPlayer.get('d1')?.starts).toBe(6);
    // The second defenceman starts the four nights the first has no game.
    expect(valuation.byPlayer.get('d2')?.starts).toBe(4);
    expect(valuation.byPlayer.get('d2')?.marginal).toBeCloseTo(20);
  });

  it('starts nobody who is out, on a club with no schedule, or eligible nowhere', () => {
    const team = [
      player('out', ['C'], 'EDM', { out: true }),
      player('lost', ['C'], 'XXX'),
      player('nowhere', [], 'EDM'),
    ];
    const valuation = valueLineup(team, SLOTS, schedule({ EDM: NIGHTS }), () => 50);

    for (const id of ['out', 'lost', 'nowhere']) {
      expect(valuation.byPlayer.get(id)).toMatchObject({ starts: 0, value: 0, marginal: 0 });
    }
  });

  it('seats a player the model has no line for after everyone with one, for nothing', () => {
    const team = [player('c1', ['C']), player('c2', ['C']), player('prospect', ['C'])];
    const valuation = valueLineup(team, SLOTS, schedule({ EDM: NIGHTS }), (id) =>
      id === 'prospect' ? null : 50,
    );

    expect(valuation.byPlayer.get('prospect')).toMatchObject({ starts: 0, marginal: 0 });
    expect(valuation.byPlayer.get('c1')?.starts).toBe(10);
  });
});

describe('swapInto', () => {
  const centres = ['c1', 'c2', 'c3'].map((id) => player(id, ['C']));
  const wing = player('w1', ['LW']);
  const team = [...centres, wing];
  const scores: Record<string, number> = { c1: 100, c2: 80, c3: 60, w1: 10 };
  const score = (id: string) => scores[id] ?? null;
  const nights = schedule({ EDM: NIGHTS });

  it('drops the player whose going costs the lineup least where the pickup plays, not the lowest scorer', () => {
    // A centre who would score 70: better than c3, but c3 starts nowhere, so dropping him
    // gains nothing where dropping c2 lets the pickup start in his place.
    const swap = swapInto(
      { playerId: 'p', positions: ['C'], teamAbbrev: 'EDM', score: 70 },
      team,
      SLOTS,
      nights,
      score,
      NO_ROOM,
    );

    expect(swap?.kind).toBe('drop');
    expect(swap?.kind === 'drop' && swap.drop.playerId).toBe('c3');
    // With c3 gone and the pickup in, the starters are still c1 and c2: nothing gained.
    expect(swap?.gain).toBeCloseTo(0);
  });

  it('weighs a pickup at a thin position against the man he replaces there', () => {
    // A wing scoring 50 replaces the wing scoring 10 in the lone wing seat, whoever is dropped
    // for him: the gain is his whole improvement either way, so the wing goes rather than the
    // benched third centre, who projects more and is the better man to keep in hand.
    const swap = swapInto(
      { playerId: 'p', positions: ['LW'], teamAbbrev: 'EDM', score: 50 },
      team,
      SLOTS,
      nights,
      score,
      NO_ROOM,
    );

    expect(swap?.kind === 'drop' && swap.drop.playerId).toBe('w1');
    expect(swap?.gain).toBeCloseTo(40);
  });

  it('prefers the drop that leaves the lineup worth the most, even a better player benched', () => {
    // A centre scoring 90 for a lineup of c1 (100), c2 (80), c3 (60): drop c3 and the pickup
    // starts over c2, gaining 10; drop c2 and the pickup starts in his place, gaining 10 as well;
    // either way the gain is 10, and the cheaper man goes.
    const swap = swapInto(
      { playerId: 'p', positions: ['C'], teamAbbrev: 'EDM', score: 90 },
      team,
      SLOTS,
      nights,
      score,
      NO_ROOM,
    );

    expect(swap?.gain).toBeCloseTo(10);
  });

  it('takes an open spot first, and prices the pickup by his starts alone', () => {
    const swap = swapInto(
      { playerId: 'p', positions: ['C'], teamAbbrev: 'EDM', score: 90 },
      team,
      SLOTS,
      nights,
      score,
      { openSpots: 1, toReserve: [] },
    );

    // He starts over c2 every night: the lineup gains his 90 and loses c2's 80.
    expect(swap).toEqual({ kind: 'open', gain: expect.closeTo(10, 5) });
  });

  it('takes an injured player to injured reserve before any drop', () => {
    const hurt = player('hurt', ['C'], 'EDM', { out: true, reserveEligible: ['IR'] });
    const swap = swapInto(
      { playerId: 'p', positions: ['LW'], teamAbbrev: 'EDM', score: 50 },
      [...team, hurt],
      SLOTS,
      nights,
      score,
      { openSpots: 0, toReserve: [{ player: hurt, slot: 'IR' }] },
    );

    expect(swap?.kind).toBe('reserve');
    expect(swap?.gain).toBeCloseTo(40);
  });

  it('drops a goalie for a goalie and a skater for a skater, and nobody on reserve or unweighed', () => {
    const goalie = player('g1', ['G'], 'EDM');
    const parked = player('ir', ['C'], 'EDM', { reserve: true, out: true });
    const prospect = player('np', ['C'], 'EDM');
    const roster = [...team, goalie, parked, prospect];
    const extras: Record<string, number | null> = { g1: 30, np: null };
    const value = (id: string) => (id in extras ? extras[id] : score(id));

    const goalieSwap = swapInto(
      { playerId: 'p', positions: ['G'], teamAbbrev: 'EDM', score: 50 },
      roster,
      SLOTS,
      nights,
      value,
      NO_ROOM,
    );
    const skaterSwap = swapInto(
      { playerId: 'q', positions: ['C'], teamAbbrev: 'EDM', score: 50 },
      roster,
      SLOTS,
      nights,
      value,
      NO_ROOM,
    );

    expect(goalieSwap?.kind === 'drop' && goalieSwap.drop.playerId).toBe('g1');
    expect(goalieSwap?.gain).toBeCloseTo(20);
    expect(skaterSwap?.kind === 'drop' && ['ir', 'np'].includes(skaterSwap.drop.playerId)).toBe(
      false,
    );
  });

  it('has nobody to drop on a team without his kind', () => {
    const swap = swapInto(
      { playerId: 'p', positions: ['G'], teamAbbrev: 'EDM', score: 50 },
      team,
      SLOTS,
      nights,
      score,
      NO_ROOM,
    );

    expect(swap).toBeNull();
  });
});
