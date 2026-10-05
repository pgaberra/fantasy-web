import { describe, expect, it } from 'vitest';
import { Projection, ScoredProjection } from '../models/projection.model';
import { TeamPlayer } from '../services/fa-scout.service';
import { lineupSeats } from '../streamer-planner/planner-lineup';
import { bestSwap, dropCandidates, scoreTeam, TeamRow } from './drop-candidates';

/** A league starting one C, two D and a G, with a bench. */
const SEATS = lineupSeats({ c: 1, lw: 0, rw: 0, w: 0, f: 0, d: 2, g: 1, util: 0, bn: 3 });

function line(type: 'skater' | 'goalie', playerId: number, goals: number): Projection {
  return {
    type,
    playerId,
    stats: { scoring: { goals } as never, utility: { gp: 70 } as never },
  };
}

/** Scores a line by its goals alone, best first, as a points league weighting only goals would. */
function rank(projections: Projection[]): ScoredProjection[] {
  return projections
    .map((projection) => ({
      projection,
      score: { fantasyPoints: (projection.stats.scoring as Record<string, number>)['goals'] },
      qualified: true,
    }))
    .sort((a, b) => b.score.fantasyPoints - a.score.fantasyPoints) as never;
}

const scoreOf = (entry: ScoredProjection) => entry.score.fantasyPoints;

function player(
  playerId: number,
  positions: string[],
  goals: number | null,
  status: Partial<Pick<TeamPlayer, 'reserve' | 'out'>> = {},
): TeamPlayer {
  const type = positions.includes('G') ? 'goalie' : 'skater';
  return {
    playerId: String(playerId),
    name: `Player ${playerId}`,
    type,
    positions,
    reserve: status.reserve ?? false,
    out: status.out ?? status.reserve ?? false,
    projection: goals === null ? null : line(type, playerId, goals),
  };
}

function rows(players: TeamPlayer[]): TeamRow[] {
  return scoreTeam(players, [], 'skater', rank, scoreOf);
}

describe('scoreTeam', () => {
  it("scores the user's players of the kind in one pool with the wire", () => {
    const team = [player(1, ['C'], 30), player(2, ['D'], 10), player(3, ['G'], 5)];
    const scored = scoreTeam(team, [line('skater', 100, 20)], 'skater', rank, scoreOf);

    expect(scored.map((row) => [row.player.playerId, row.score])).toEqual([
      ['1', 30],
      ['2', 10],
    ]);
  });

  it('leaves a player the model has no line for unscored', () => {
    const scored = rows([player(1, ['C'], null)]);

    expect(scored[0].score).toBeNull();
  });
});

describe('bestSwap', () => {
  // One C and three D for one C and two D seats: the worst D is spare, the C is not.
  const team = rows([
    player(1, ['C'], 30),
    player(2, ['C'], 4),
    player(3, ['D'], 20),
    player(4, ['D'], 15),
    player(5, ['D'], 8),
  ]);

  it('drops the lowest scorer whose loss keeps the lineup full', () => {
    const swap = bestSwap({ positions: ['D'], score: 12 }, team, SEATS);

    expect(swap?.drop.player.playerId).toBe('2');
    expect(swap?.gain).toBe(8);
  });

  it('passes over a player the lineup cannot start without, unless the pickup plays there', () => {
    const tight = rows([player(1, ['C'], 30), player(3, ['D'], 20), player(4, ['D'], 5)]);

    // A C pickup cannot replace the second D: one D seat would go empty.
    expect(bestSwap({ positions: ['C'], score: 12 }, tight, SEATS)?.drop.player.playerId).toBe('1');
    // A D pickup can.
    expect(bestSwap({ positions: ['D'], score: 12 }, tight, SEATS)?.drop.player.playerId).toBe('4');
  });

  it('never drops a player on injured reserve, who holds no roster spot', () => {
    const withReserve = rows([
      player(1, ['C'], 30),
      player(3, ['D'], 20),
      player(4, ['D'], 15),
      player(6, ['C', 'D'], 1, { reserve: true }),
      player(5, ['D'], 8),
    ]);

    expect(
      bestSwap({ positions: ['D'], score: 12 }, withReserve, SEATS)?.drop.player.playerId,
    ).toBe('5');
  });

  it('drops a player out injured on the bench, whose seat is already empty', () => {
    const hurt = rows([
      player(1, ['C'], 30),
      player(3, ['D'], 20),
      player(4, ['D'], 15),
      player(7, ['D'], 3, { out: true }),
    ]);

    expect(bestSwap({ positions: ['C'], score: 12 }, hurt, SEATS)?.drop.player.playerId).toBe('7');
  });

  it('reports a swap that is no upgrade as a loss', () => {
    expect(bestSwap({ positions: ['D'], score: 2 }, team, SEATS)?.gain).toBe(-2);
  });

  it('finds none when every player is needed and the pickup fills no seat of theirs', () => {
    const bare = rows([player(1, ['C'], 30), player(3, ['D'], 20), player(4, ['D'], 15)]);

    expect(bestSwap({ positions: ['LW'], score: 50 }, bare, SEATS)).toBeNull();
  });

  it('judges on score alone when the league lineup is not known', () => {
    const bare = rows([player(1, ['C'], 30), player(3, ['D'], 20), player(4, ['D'], 15)]);

    expect(bestSwap({ positions: ['LW'], score: 50 }, bare, [])?.drop.player.playerId).toBe('4');
  });
});

describe('dropCandidates', () => {
  it('lists the lowest three, each with the positions a pickup must play to replace him', () => {
    const team = rows([
      player(1, ['C'], 30),
      player(2, ['C'], 4),
      player(3, ['D'], 20),
      player(4, ['D'], 6),
      player(8, ['C'], null),
    ]);

    const candidates = dropCandidates(team, SEATS);

    expect(candidates.map((candidate) => candidate.row.player.playerId)).toEqual(['2', '4', '3']);
    // The spare C goes for anyone; either D only for another D.
    expect(candidates[0]).toMatchObject({ anyPickup: true, needs: [] });
    expect(candidates[1]).toMatchObject({ anyPickup: false, needs: ['D'] });
    expect(candidates[2]).toMatchObject({ anyPickup: false, needs: ['D'] });
  });
});
