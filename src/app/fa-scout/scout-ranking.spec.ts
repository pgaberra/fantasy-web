import { describe, expect, it } from 'vitest';
import { Projection, ScoredProjection } from '../models/projection.model';
import { ScoutPlayer } from '../services/fa-scout.service';
import { isRising, rankScout, toiPerGame } from './scout-ranking';

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

  const rows = rankScout([...steady, montour, rookie, goalie], 'skater', byValue, fantasyPoints);

  it('ranks the kind asked for alone, on the rest of the season', () => {
    expect(rows.map((row) => row.line.type)).not.toContain('goalie');
    expect(rows[0].player.playerId).toBe('99');
    expect(rows[0].rank).toBe(1);
    expect(rows[0].score).toBe(60);
  });

  it('places each player on the preseason line among the same players', () => {
    // On the preseason lines Montour's 20 is last of the sixteen that have one.
    expect(rows[0].preseasonRank).toBe(16);
    expect(rows[0].rise).toBe(15);
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

  it('ranks the goalies among themselves', () => {
    const goalies = rankScout([...steady, goalie], 'goalie', byValue, fantasyPoints);
    expect(goalies.map((row) => [row.player.playerId, row.rank, row.preseasonRank])).toEqual([
      ['50', 1, 1],
    ]);
  });
});

describe('the role a line reads', () => {
  it('reads a skater ice time a game, and none for a goalie', () => {
    expect(toiPerGame(skaterLine(1, 10, 70, 1380))).toBe(1380);
    expect(toiPerGame(goalieLine(2, 10))).toBeUndefined();
    expect(toiPerGame(null)).toBeUndefined();
  });
});
