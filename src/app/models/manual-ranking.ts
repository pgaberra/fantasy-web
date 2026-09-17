import { ScoredProjection, ScoringType } from './projection.model';

export type RankingMode = 'projected' | 'manual';

export type RankedPlayerType = 'skater' | 'goalie';

export const RANKED_PLAYER_TYPES: readonly RankedPlayerType[] = ['skater', 'goalie'];

export interface PlayerTypeRanking {
  readonly mode: RankingMode;
  /** The players placed by hand, best first. Everyone else keeps his projected place below them. */
  readonly order: readonly number[];
}

export type ManualRanking = Readonly<Record<RankedPlayerType, PlayerTypeRanking>>;

/** What every projection ranked before anyone could rank one by hand. */
export const PROJECTED_RANKING: ManualRanking = {
  skater: { mode: 'projected', order: [] },
  goalie: { mode: 'projected', order: [] },
};

export function isHandRanked(ranking: ManualRanking, type: RankedPlayerType): boolean {
  return ranking[type].mode === 'manual';
}

export function anyHandRanked(ranking: ManualRanking): boolean {
  return RANKED_PLAYER_TYPES.some((type) => isHandRanked(ranking, type));
}

/**
 * Whether the projection has anything to say about its order at all: a type ranked by hand, or an
 * order kept from one that was. The second is why this is not simply {@link anyHandRanked} - going
 * back to the projected board must not be how an owner loses the order they typed.
 */
export function hasAnyRanking(ranking: ManualRanking): boolean {
  return RANKED_PLAYER_TYPES.some(
    (type) => isHandRanked(ranking, type) || ranking[type].order.length > 0,
  );
}

export function withMode(
  ranking: ManualRanking,
  type: RankedPlayerType,
  mode: RankingMode,
): ManualRanking {
  return { ...ranking, [type]: { ...ranking[type], mode } };
}

export function withOrder(
  ranking: ManualRanking,
  type: RankedPlayerType,
  order: readonly number[],
): ManualRanking {
  return { ...ranking, [type]: { ...ranking[type], order } };
}

/**
 * The order to store once a player has been put at a place: everybody above him, as the board
 * shows them now, and him last.
 *
 * What sits below him is where the projections already put it, so storing it would only be a
 * copy that has to be kept in step with a pool that changes all season. An owner who ranks a top
 * twenty stores twenty players, not the sixteen hundred he did not rank.
 */
export function orderWithPlayerAt(
  typeOrder: readonly number[],
  playerId: number,
  rank: number,
): readonly number[] {
  const others = typeOrder.filter((id) => id !== playerId);
  const index = Math.min(Math.max(rank - 1, 0), others.length);
  return [...others.slice(0, index), playerId];
}

/**
 * The owner's order, on the projection's scale.
 *
 * A hand ranking says who is better than whom and nothing about by how much, and the board has to
 * hold goalies and skaters in one list: "my third goalie" cannot be weighed against "my third
 * centre" the way two projected totals can. So the value slots stay exactly where the projections
 * put them — the same scores in the same order — and the hand ranking only decides who sits in
 * which. The player placed first takes the top slot's value, the second takes the second's, and a
 * player nobody placed keeps his projected place below them.
 *
 * A slot's qualification travels with its value, so a hand-ranked goalie is not sent to the
 * bottom of the board by a games minimum that only exists to keep a ten-game save percentage out
 * of a ranking nobody typed by hand.
 */
export function applyManualRanking(
  scored: ScoredProjection[],
  ranking: ManualRanking,
  scoringType: ScoringType,
): ScoredProjection[] {
  if (!anyHandRanked(ranking)) {
    return scored;
  }
  const valueOf = (entry: ScoredProjection): number =>
    scoringType === 'points' ? entry.score.fantasyPoints : entry.score.zScore;
  const reseated = [...scored];
  for (const type of RANKED_PLAYER_TYPES) {
    if (!isHandRanked(ranking, type)) {
      continue;
    }
    const seats: number[] = [];
    scored.forEach((entry, index) => {
      if (entry.projection.type === type) {
        seats.push(index);
      }
    });
    if (seats.length === 0) {
      continue;
    }
    const seated = reseat(
      seats.map((index) => scored[index]),
      ranking[type].order,
      valueOf,
    );
    seats.forEach((index, seat) => {
      reseated[index] = seated[seat];
    });
  }
  return reseated;
}

function reseat(
  entries: ScoredProjection[],
  order: readonly number[],
  valueOf: (entry: ScoredProjection) => number,
): ScoredProjection[] {
  const slots = [...entries].sort((first, second) => {
    if (first.qualified !== second.qualified) {
      return first.qualified ? -1 : 1;
    }
    return valueOf(second) - valueOf(first);
  });
  const byPlayerId = new Map(entries.map((entry) => [entry.projection.playerId, entry]));
  const placed: ScoredProjection[] = [];
  const seated = new Set<number>();
  for (const playerId of order) {
    const entry = byPlayerId.get(playerId);
    // An id the pool no longer carries, or one named twice, is skipped rather than allowed to
    // take a seat: a ranking outlives the players in it, and the rest of the order still holds.
    if (entry && !seated.has(playerId)) {
      seated.add(playerId);
      placed.push(entry);
    }
  }
  for (const entry of slots) {
    if (!seated.has(entry.projection.playerId)) {
      placed.push(entry);
    }
  }
  return placed.map((entry, index) => ({
    ...entry,
    score: slots[index].score,
    qualified: slots[index].qualified,
  }));
}
