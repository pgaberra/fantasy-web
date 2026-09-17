import { describe, expect, it } from 'vitest';
import {
  applyManualRanking,
  ManualRanking,
  orderWithPlayerAt,
  PROJECTED_RANKING,
  withMode,
  withOrder,
} from './manual-ranking';
import { Projection, ScoredProjection } from './projection.model';

function entry(
  id: number,
  type: 'skater' | 'goalie',
  fantasyPoints: number,
  qualified = true,
): ScoredProjection {
  return {
    projection: { type, playerId: id, stats: { utility: {}, scoring: {} } } as Projection,
    score: { fantasyPoints, zScore: fantasyPoints / 100 },
    qualified,
  };
}

function ranked(ranking: ManualRanking, scored: ScoredProjection[]): ScoredProjection[] {
  return applyManualRanking(scored, ranking, 'points').sort(
    (first, second) => second.score.fantasyPoints - first.score.fantasyPoints,
  );
}

function handRankedGoalies(order: number[]): ManualRanking {
  return withOrder(withMode(PROJECTED_RANKING, 'goalie', 'manual'), 'goalie', order);
}

describe('applyManualRanking', () => {
  const board = [
    entry(1, 'skater', 500),
    entry(20, 'goalie', 300),
    entry(21, 'goalie', 250),
    entry(22, 'goalie', 200),
  ];

  /** The board is ~1600 rows and this runs on every edit of any of them. */
  it('hands back the same board when neither type is ranked by hand', () => {
    expect(applyManualRanking(board, PROJECTED_RANKING, 'points')).toBe(board);
  });

  it('puts the player placed first at the top of his type', () => {
    const order = ranked(handRankedGoalies([22]), board);

    expect(order.map((sp) => sp.projection.playerId)).toEqual([1, 22, 20, 21]);
  });

  /**
   * The point of the whole exercise: the goalie the owner moved to the top is worth what the top
   * goalie was worth, so the board can still weigh him against a skater.
   */
  it('gives him the value of the seat he was put in, not the one he came from', () => {
    const order = ranked(handRankedGoalies([22]), board);

    expect(order[1].score.fantasyPoints).toBe(300);
    expect(order.map((sp) => sp.score.fantasyPoints)).toEqual([500, 300, 250, 200]);
  });

  it('leaves the players nobody placed in their projected order below the placed ones', () => {
    const order = ranked(handRankedGoalies([21]), board);

    expect(order.map((sp) => sp.projection.playerId)).toEqual([1, 21, 20, 22]);
  });

  it('leaves a type that is not ranked by hand alone', () => {
    const order = ranked(handRankedGoalies([22]), board);

    expect(order[0].projection.playerId).toBe(1);
    expect(order[0].score.fantasyPoints).toBe(500);
  });

  /** An order outlives the pool it was written against, and the rest of it still holds. */
  it('skips a player the pool no longer carries', () => {
    const order = ranked(handRankedGoalies([999, 22]), board);

    expect(order.map((sp) => sp.projection.playerId)).toEqual([1, 22, 20, 21]);
  });

  it('seats a player named twice once', () => {
    const order = ranked(handRankedGoalies([22, 22, 20]), board);

    expect(order.map((sp) => sp.projection.playerId)).toEqual([1, 22, 20, 21]);
  });

  /**
   * The games minimum keeps a ten-game save percentage out of a ranking computed from stats. It
   * has nothing to say about an order typed by hand, so it must not send a hand-placed goalie to
   * the bottom of the board.
   */
  it('gives the seat its qualification, so a placed goalie is not demoted by the games minimum', () => {
    const withUnqualified = [
      entry(1, 'skater', 500),
      entry(20, 'goalie', 300),
      entry(21, 'goalie', 900, false),
    ];

    const seated = applyManualRanking(withUnqualified, handRankedGoalies([21]), 'points');
    const goalies = seated.filter((sp) => sp.projection.type === 'goalie');

    expect(goalies.map((sp) => sp.projection.playerId)).toEqual([21, 20]);
    expect(goalies[0].qualified).toBe(true);
    expect(goalies[0].score.fantasyPoints).toBe(300);
    expect(goalies[1].qualified).toBe(false);
  });

  it('seats a category league by z-score', () => {
    const categoryBoard = [
      { ...entry(20, 'goalie', 0), score: { fantasyPoints: 0, zScore: 4 } },
      { ...entry(21, 'goalie', 0), score: { fantasyPoints: 0, zScore: 1 } },
    ];

    const seated = applyManualRanking(categoryBoard, handRankedGoalies([21]), 'category');

    expect(seated.map((sp) => sp.projection.playerId)).toEqual([21, 20]);
    expect(seated[0].score.zScore).toBe(4);
  });
});

describe('orderWithPlayerAt', () => {
  const goalies = [10, 11, 12, 13];

  it('keeps everybody above the place and stops at the player put there', () => {
    expect(orderWithPlayerAt(goalies, 13, 2)).toEqual([10, 13]);
  });

  it('stores one player when he is put first', () => {
    expect(orderWithPlayerAt(goalies, 13, 1)).toEqual([13]);
  });

  it('closes the gap the player left when he moves down', () => {
    expect(orderWithPlayerAt(goalies, 10, 3)).toEqual([11, 12, 10]);
  });

  it('puts a place past the end of the list at the end', () => {
    expect(orderWithPlayerAt(goalies, 10, 99)).toEqual([11, 12, 13, 10]);
  });

  it('puts a place below one at the top', () => {
    expect(orderWithPlayerAt(goalies, 12, 0)).toEqual([12]);
  });
});
