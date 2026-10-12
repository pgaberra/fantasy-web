import { describe, expect, it } from 'vitest';
import { Projection, ScoredProjection } from '../models/projection.model';
import { ScoutPlayer } from '../services/fa-scout.service';
import {
  isRising,
  nextScoutSort,
  rankScout,
  SCOUT_RANKED_ORDER,
  sortScout,
  toiPerGame,
} from './scout-ranking';

function skaterLine(playerId: number, points: number, games = 70, toi = 1000, ppp = 5): Projection {
  return {
    type: 'skater',
    playerId,
    stats: {
      scoring: { points, ppp } as never,
      utility: { gp: games, toiPerGame: toi },
    },
  };
}

function goalieLine(playerId: number, wins: number): Projection {
  return {
    type: 'goalie',
    playerId,
    stats: { scoring: { w: wins } as never, utility: { gp: 40 } },
  };
}

function player(now: Projection, preseason: Projection | null): ScoutPlayer {
  return {
    freeAgent: {
      projection: now,
      playerId: String(now.playerId),
      name: `Player ${now.playerId}`,
      positions: [now.type === 'skater' ? 'D' : 'G'],
      availability: 'FREE_AGENT',
      clubGames: now.stats.utility.gp,
      expectedGames: now.stats.utility.gp,
      projected: new Set(['points']),
    },
    preseason,
  };
}

/** Ranks by the one number each line carries, best first, as the engine ranks by a league. */
function byValue(projections: Projection[]): ScoredProjection[] {
  const value = (projection: Projection) =>
    projection.type === 'skater'
      ? projection.stats.scoring.points
      : (projection.stats.scoring as { w: number }).w;
  return projections
    .map((projection) => ({
      projection,
      score: { fantasyPoints: value(projection), zScore: value(projection) / 10 } as never,
      qualified: true,
    }))
    .sort((first, second) => value(second.projection) - value(first.projection));
}

const fantasyPoints = (entry: ScoredProjection) => entry.score.fantasyPoints;

describe('isRising', () => {
  it('takes a climb to the top of the wire for a rise', () => {
    expect(isRising(12, 30)).toBe(true);
  });

  it('takes first from eighth for a rise, though the top has little room to climb', () => {
    expect(isRising(1, 8)).toBe(true);
  });

  it('takes a small climb low on the list for noise', () => {
    expect(isRising(100, 115)).toBe(false);
  });

  it('wants his place at least halved', () => {
    expect(isRising(20, 39)).toBe(false);
    expect(isRising(20, 40)).toBe(true);
  });

  it('wants at least five places, however high he is', () => {
    expect(isRising(2, 6)).toBe(false);
    expect(isRising(2, 7)).toBe(true);
  });

  it('says nothing of a player with no preseason line', () => {
    expect(isRising(1, null)).toBe(false);
  });
});

describe('rankScout', () => {
  // Fifteen depth skaters the model liked in September, then one who has taken a top role since.
  const steady = Array.from({ length: 15 }, (_, index) =>
    player(skaterLine(index + 1, 40 - index), skaterLine(index + 1, 40 - index)),
  );
  const montour = player(skaterLine(99, 60, 70, 1380), skaterLine(99, 20, 80, 1050));
  const rookie = player(skaterLine(77, 39.5), null);
  const goalie = player(goalieLine(50, 20), goalieLine(50, 25));

  const rows = rankScout([...steady, montour, rookie, goalie], byValue, fantasyPoints);

  it('ranks skaters and goalies in one list, on the rest of the season', () => {
    expect(rows).toHaveLength(18);
    expect(rows[0].player.playerId).toBe('99');
    expect(rows[0].rank).toBe(1);
    expect(rows[0].score).toBe(60);
  });

  it('places each player on the preseason line among the same players', () => {
    // On the preseason lines Montour's 20 is last of the seventeen that have one, the goalie too.
    expect(rows[0].preseasonRank).toBe(17);
    expect(rows[0].rise).toBe(16);
    expect(rows[0].rising).toBe(true);
  });

  it('leaves a player the model did not project in September unranked there, not risen', () => {
    const row = rows.find((candidate) => candidate.player.playerId === '77');
    expect(row?.preseasonRank).toBeNull();
    expect(row?.rise).toBeNull();
    expect(row?.rising).toBe(false);
  });

  it('keeps a player who has not moved off the rising list', () => {
    const row = rows.find((candidate) => candidate.player.playerId === '3');
    expect(row?.rising).toBe(false);
  });

  it('places a goalie among the skaters by his score', () => {
    const row = rows.find((candidate) => candidate.player.playerId === '50');
    // His 20 wins now are below every skater; his 25 in September were above Montour's 20.
    expect([row?.rank, row?.preseasonRank, row?.rise]).toEqual([18, 16, -2]);
  });
});

describe('the role a line reads', () => {
  it('reads a skater ice time a game, and none for a goalie', () => {
    expect(toiPerGame(skaterLine(1, 10, 70, 1380))).toBe(1380);
    expect(toiPerGame(goalieLine(2, 10))).toBeUndefined();
    expect(toiPerGame(null)).toBeUndefined();
  });
});

describe('sorting the scout list', () => {
  // Ranked 1 to 4 now; on the preseason lines 4 was first, 3 second and 2 third, 1 had none.
  const rows = rankScout(
    [
      player(skaterLine(1, 30), null),
      player(skaterLine(2, 20), skaterLine(2, 10)),
      player(skaterLine(3, 10), skaterLine(3, 30)),
      player(skaterLine(4, 5), skaterLine(4, 40)),
    ],
    byValue,
    fantasyPoints,
  );
  const ids = (sorted: readonly { player: { playerId: string } }[]) =>
    sorted.map((row) => row.player.playerId);

  it('leaves the ranked order as it came', () => {
    expect(sortScout(rows, SCOUT_RANKED_ORDER)).toBe(rows);
  });

  it('sorts by the rise, the furthest risen first, a player with no preseason line last', () => {
    expect(rows.map((row) => row.rise)).toEqual([null, 1, -1, -3]);
    expect(ids(sortScout(rows, { key: 'rise', descending: true }))).toEqual(['2', '3', '4', '1']);
  });

  it('keeps a player with no preseason line last when the rise is turned round', () => {
    expect(ids(sortScout(rows, { key: 'rise', descending: false }))).toEqual(['4', '3', '2', '1']);
  });

  it('sorts the other columns as the planner does', () => {
    expect(ids(sortScout(rows, { key: 'score', descending: false }))).toEqual(['4', '3', '2', '1']);
    expect(ids(sortScout(rows, { key: 'name', descending: true }))).toEqual(['4', '3', '2', '1']);
  });

  it('opens the rise at the furthest risen, and turns it round on a second press', () => {
    const rise = nextScoutSort(SCOUT_RANKED_ORDER, 'rise');
    expect(rise).toEqual({ key: 'rise', descending: true });
    expect(nextScoutSort(rise, 'rise')).toEqual({ key: 'rise', descending: false });
  });

  it('opens every other column best first, from the rise too', () => {
    const rise = { key: 'rise', descending: false } as const;
    expect(nextScoutSort(rise, 'score')).toEqual({ key: 'score', descending: true });
    expect(nextScoutSort(rise, 'name')).toEqual({ key: 'name', descending: false });
    expect(nextScoutSort(rise, 'goals')).toEqual({ key: 'goals', descending: true });
  });
});
