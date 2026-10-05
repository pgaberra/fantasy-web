import { describe, expect, it } from 'vitest';
import { Projection, ScoredProjection } from '../models/projection.model';
import { TeamPlayer } from '../services/fa-scout.service';
import { lineupSeats } from '../streamer-planner/planner-lineup';
import { bestSwap, dropCandidates, scoreTeam, Swap, teamRoom, TeamRow } from './drop-candidates';

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
    reserveEligible: [],
    projection: goals === null ? null : line(type, playerId, goals),
  };
}

/** The player a swap drops, or null for a swap that drops nobody. */
function dropped(swap: Swap | null): string | null {
  return swap?.kind === 'drop' ? swap.drop.player.playerId : null;
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

    expect(dropped(swap)).toBe('2');
    expect(swap?.gain).toBe(8);
  });

  it('passes over a player the lineup cannot start without, unless the pickup plays there', () => {
    const tight = rows([player(1, ['C'], 30), player(3, ['D'], 20), player(4, ['D'], 5)]);

    // A C pickup cannot replace the second D: one D seat would go empty.
    expect(dropped(bestSwap({ positions: ['C'], score: 12 }, tight, SEATS))).toBe('1');
    // A D pickup can.
    expect(dropped(bestSwap({ positions: ['D'], score: 12 }, tight, SEATS))).toBe('4');
  });

  it('never drops a player on injured reserve, who holds no roster spot', () => {
    const withReserve = rows([
      player(1, ['C'], 30),
      player(3, ['D'], 20),
      player(4, ['D'], 15),
      player(6, ['C', 'D'], 1, { reserve: true }),
      player(5, ['D'], 8),
    ]);

    expect(dropped(bestSwap({ positions: ['D'], score: 12 }, withReserve, SEATS))).toBe('5');
  });

  it('drops a player out injured on the bench, whose seat is already empty', () => {
    const hurt = rows([
      player(1, ['C'], 30),
      player(3, ['D'], 20),
      player(4, ['D'], 15),
      player(7, ['D'], 3, { out: true }),
    ]);

    expect(dropped(bestSwap({ positions: ['C'], score: 12 }, hurt, SEATS))).toBe('7');
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

    expect(dropped(bestSwap({ positions: ['LW'], score: 50 }, bare, []))).toBe('4');
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

describe('teamRoom', () => {
  /** One C, two D, one G and a bench of two: six roster spots. */
  const SLOTS = { c: 1, lw: 0, rw: 0, w: 0, f: 0, d: 2, g: 1, util: 0, bn: 2 };

  function injured(playerId: number, games: number, eligible: string[]): TeamPlayer {
    return {
      ...player(playerId, ['D'], 5, { out: true }),
      injuryStatus: 'O',
      slot: 'BN',
      reserveEligible: eligible,
      projection: {
        ...line('skater', playerId, 5),
        stats: { scoring: {} as never, utility: { gp: games } as never },
      },
    };
  }

  it('counts the roster spots nobody holds, leaving injured reserve out', () => {
    const team = [
      player(1, ['C'], 30),
      player(2, ['D'], 20),
      player(3, ['D'], 20),
      { ...player(4, ['C'], 0, { reserve: true }), slot: 'IR' },
    ];

    expect(teamRoom(team, SLOTS, {}).openSpots).toBe(3);
    // The league's slots unknown, no spot is assumed open.
    expect(teamRoom(team, null, {}).openSpots).toBe(0);
  });

  it('moves an injured player the platform allows into a free IR slot', () => {
    const team = [player(1, ['C'], 30), injured(2, 40, ['IR'])];

    expect(teamRoom(team, SLOTS, { IR: 1 }).toReserve).toEqual([{ player: team[1], slot: 'IR' }]);
  });

  it('moves nobody into a slot already taken, or a player the platform keeps out', () => {
    const team = [
      { ...player(1, ['C'], 0, { reserve: true }), slot: 'IR' },
      injured(2, 40, ['IR']),
      injured(3, 40, []),
    ];

    expect(teamRoom(team, SLOTS, { IR: 1 }).toReserve).toEqual([]);
    expect(teamRoom(team, SLOTS, { IR: 2 }).toReserve.map((move) => move.player.playerId)).toEqual([
      '2',
    ]);
  });

  it('gives the slots to the injured with the most games left, IR before IR+', () => {
    const shortTerm = injured(2, 60, ['IR']);
    const longTerm = injured(3, 10, ['IR']);
    const outOnly = injured(4, 30, ['IR+']);

    const room = teamRoom([shortTerm, longTerm, outOnly], SLOTS, { IR: 1, 'IR+': 1 });

    // IR+ takes whoever IR takes, so the IR-eligible player goes to IR and leaves IR+ for the
    // one only it takes; the one with fewest games left is kept on the roster.
    expect(room.toReserve.map((move) => [move.player.playerId, move.slot])).toEqual([
      ['2', 'IR'],
      ['4', 'IR+'],
    ]);
  });

  it('makes room for a pickup with nobody dropped, and keeps the mover off the drop list', () => {
    const hurt = injured(7, 40, ['IR']);
    const team = rows([player(1, ['C'], 30), player(3, ['D'], 20), player(4, ['D'], 15), hurt]);
    const room = teamRoom(
      team.map((row) => row.player),
      SLOTS,
      { IR: 1 },
    );

    const swap = bestSwap({ positions: ['C'], score: 12 }, team, SEATS, { ...room, openSpots: 0 });
    expect(swap).toEqual({ kind: 'reserve', move: { player: hurt, slot: 'IR' }, gain: 12 });
    expect(
      dropCandidates(team, SEATS, room).map((candidate) => candidate.row.player.playerId),
    ).not.toContain('7');
  });

  it('takes an open roster spot before anything else', () => {
    expect(
      bestSwap({ positions: ['C'], score: 12 }, rows([player(1, ['C'], 30)]), SEATS, {
        openSpots: 1,
        toReserve: [],
      }),
    ).toEqual({ kind: 'open', gain: 12 });
  });
});
