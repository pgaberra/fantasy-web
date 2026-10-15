import { describe, expect, it } from 'vitest';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamPlayer } from '../services/player-scout.service';
import { priceDrop, valueLineup } from './lineup-value';

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

describe('priceDrop', () => {
  const centres = ['c1', 'c2', 'c3'].map((id) => player(id, ['C']));
  const wing = player('w1', ['LW']);
  const team = [...centres, wing];
  const scores: Record<string, number> = { c1: 100, c2: 80, c3: 60, w1: 10 };
  const score = (id: string) => scores[id] ?? null;
  const nights = schedule({ EDM: NIGHTS });
  const byId = (id: string) => team.find((player) => player.playerId === id)!;
  const pickup = (positions: string[], total: number, teamAbbrev = 'EDM') => ({
    playerId: 'p',
    positions,
    teamAbbrev,
    score: total,
  });

  it('prices a pickup by the seats, not the projections: a benched drop costs nothing', () => {
    // c3 starts nowhere behind c1 and c2. A centre scoring 70 cannot start either, so the swap
    // gains nothing; dropped for a centre scoring 90, the pickup starts over c2: ten gained.
    const pricing = priceDrop(byId('c3'), team, SLOTS, nights, score);

    expect(pricing.gainFor(pickup(['C'], 70))).toBeCloseTo(0);
    expect(pricing.gainFor(pickup(['C'], 90))).toBeCloseTo(10);
  });

  it('charges a starter his starts: the pickup has to replace what the lineup loses', () => {
    // Without c2, c3 starts in his place: the lineup is 20 worse off. A centre scoring 70 then
    // starts over c3, so the swap nets 70 less 80.
    const pricing = priceDrop(byId('c2'), team, SLOTS, nights, score);

    expect(pricing.gainFor(pickup(['C'], 70))).toBeCloseTo(-10);
    // A wing scoring 50 takes the wing seat from w1 (40 gained) while c3 fills c2's seat (20 lost).
    expect(pricing.gainFor(pickup(['LW'], 50))).toBeCloseTo(20);
  });

  it('weighs a pickup at a thin position against the man he replaces there', () => {
    const pricing = priceDrop(byId('w1'), team, SLOTS, nights, score);

    expect(pricing.gainFor(pickup(['LW'], 50))).toBeCloseTo(40);
  });

  it('counts only the nights either of them plays', () => {
    // The drop plays the first six nights, the pickup the last six: on the four nights only the
    // drop plays the lineup loses his seat, on the four only the pickup plays it gains his, and
    // on the two they share the pickup replaces him.
    const roster = [player('d1', ['D'], 'COL'), player('c1', ['C'], 'COL')];
    const pricing = priceDrop(
      roster[0],
      roster,
      SLOTS,
      schedule({ COL: NIGHTS.slice(0, 6), BOS: NIGHTS.slice(4) }),
      (id) => ({ d1: 60, c1: 10 })[id] ?? null,
    );

    // d1 is worth 10 a night over six nights; the pickup 20 a night over six.
    expect(pricing.gainFor(pickup(['D'], 120, 'BOS'))).toBeCloseTo(120 - 60);
  });

  it('cannot price a pickup whose club has no night in the schedule', () => {
    const pricing = priceDrop(byId('c3'), team, SLOTS, nights, score);

    expect(pricing.gainFor(pickup(['C'], 90, 'XXX'))).toBeNull();
  });

  it('prices a drop who is out as costing nothing: his seat is empty already', () => {
    const hurt = player('hurt', ['LW'], 'EDM', { out: true });
    const pricing = priceDrop(hurt, [...team, hurt], SLOTS, nights, (id) =>
      id === 'hurt' ? 90 : score(id),
    );

    // The wing seat holds w1 at 10 a game; the pickup takes it for his whole 50.
    expect(pricing.gainFor(pickup(['LW'], 50))).toBeCloseTo(40);
  });

  it('prices a goalie against a skater drop the same way: the seats decide', () => {
    const goalie = player('g1', ['G'], 'EDM');
    const roster = [...team, goalie];
    const value = (id: string) => (id === 'g1' ? 30 : score(id));

    // Dropping the benched c3 for a goalie scoring 50: he takes the crease from g1 (20 gained).
    expect(
      priceDrop(byId('c3'), roster, SLOTS, nights, value).gainFor(pickup(['G'], 50)),
    ).toBeCloseTo(20);
    // Dropping the goalie for him: the crease changes hands, 20 gained as well.
    expect(priceDrop(goalie, roster, SLOTS, nights, value).gainFor(pickup(['G'], 50))).toBeCloseTo(
      20,
    );
  });
});
