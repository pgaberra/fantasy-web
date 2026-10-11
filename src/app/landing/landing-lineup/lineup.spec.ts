import { describe, expect, it } from 'vitest';
import { changedSlots, fillLineup, LineupRow } from './lineup';
import { Goalie, Player, Skater } from '../../models/player.model';
import { GoalieStats, ScoredProjection, SkaterStats } from '../../models/projection.model';
import { SkaterPosition } from '../../models/position.model';

function skater(id: number, name: string, positions: SkaterPosition[], gp = 82): Skater {
  return {
    id,
    type: 'skater',
    name,
    positions: new Set(positions),
    stats: { scoring: {}, utility: { gp, toiPerGame: 0 } } as unknown as SkaterStats,
  };
}

function goalie(id: number, name: string, gp = 60): Goalie {
  return {
    id,
    type: 'goalie',
    name,
    stats: { scoring: {}, utility: { gp } } as unknown as GoalieStats,
  };
}

function scored(player: Player, fantasyPoints: number, qualified = true): ScoredProjection {
  return {
    projection:
      player.type === 'skater'
        ? { type: 'skater', playerId: player.id, stats: player.stats }
        : { type: 'goalie', playerId: player.id, stats: player.stats },
    score: { fantasyPoints, zScore: fantasyPoints / 10 },
    qualified,
  };
}

describe('fillLineup', () => {
  const mcdavid = skater(1, 'Connor McDavid', ['C']);
  const draisaitl = skater(2, 'Leon Draisaitl', ['C', 'LW']);
  const kaprizov = skater(3, 'Kirill Kaprizov', ['LW']);
  const kucherov = skater(4, 'Nikita Kucherov', ['RW']);
  const makar = skater(5, 'Cale Makar', ['D']);
  const hughes = skater(6, 'Quinn Hughes', ['D']);
  const hellebuyck = goalie(7, 'Connor Hellebuyck');
  const players = [mcdavid, draisaitl, kaprizov, kucherov, makar, hughes, hellebuyck];
  const byId = new Map(players.map((player) => [player.id, player]));

  it('fills each slot with the best unused player eligible for it, in ranking order', () => {
    const ranked = [
      scored(mcdavid, 500),
      scored(hellebuyck, 480),
      scored(draisaitl, 450),
      scored(kaprizov, 420),
      scored(kucherov, 400),
      scored(makar, 360),
      scored(hughes, 320),
    ];

    const lineup = fillLineup(ranked, byId, 'points');

    expect(lineup.map((row) => [row.slot, row.player?.name])).toEqual([
      ['C', 'Connor McDavid'],
      // Draisaitl is a centre too, and the second C slot comes before LW, so he takes it.
      ['C', 'Leon Draisaitl'],
      ['LW', 'Kirill Kaprizov'],
      ['RW', 'Nikita Kucherov'],
      ['D', 'Cale Makar'],
      ['D', 'Quinn Hughes'],
      ['G', 'Connor Hellebuyck'],
    ]);
    expect(lineup[0].score).toBe(500);
    expect(lineup[0].gp).toBe(82);
  });

  it('reads the z-score in a category league', () => {
    const lineup = fillLineup([scored(mcdavid, 500)], byId, 'category');

    expect(lineup[0].score).toBe(50);
  });

  it('leaves a slot empty when nobody eligible is left, rather than seating the wrong kind', () => {
    const lineup = fillLineup([scored(mcdavid, 500), scored(hellebuyck, 480)], byId, 'points');

    expect(lineup[2]).toEqual({ slot: 'LW', player: null, score: null, gp: null });
    expect(lineup[6].player?.name).toBe('Connor Hellebuyck');
  });

  it('skips a ranked player the pool does not hold', () => {
    const lineup = fillLineup([scored(skater(99, 'Nobody', ['C']), 900)], byId, 'points');

    expect(lineup[0].player).toBeNull();
  });
});

describe('changedSlots', () => {
  const row = (slot: LineupRow['slot'], player: Player | null): LineupRow => ({
    slot,
    player,
    score: null,
    gp: null,
  });

  it('names the slots whose player changed, by index', () => {
    const a = skater(1, 'A', ['C']);
    const b = skater(2, 'B', ['C']);
    const before = [row('C', a), row('C', b), row('G', null)];
    const after = [row('C', b), row('C', a), row('G', null)];

    expect(changedSlots(before, after)).toEqual([0, 1]);
  });

  it('counts a slot that was empty and is now filled', () => {
    const a = skater(1, 'A', ['C']);

    expect(changedSlots([row('C', null)], [row('C', a)])).toEqual([0]);
    expect(changedSlots([row('C', a)], [row('C', a)])).toEqual([]);
  });
});
