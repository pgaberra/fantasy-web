import { Projection, ScoredProjection } from '../models/projection.model';
import { RankedFreeAgent } from '../streamer-planner/planner-free-agents';
import { ScoutPlayer } from '../services/fa-scout.service';

/** Skaters or goalies: they fill different roster slots and score different categories. */
export type ScoutKind = Projection['type'];

/**
 * An available player ranked on the rest of the season, with the place the model's preseason line
 * gave him among the same players. The planner's row, so its table helpers draw it.
 */
export interface ScoutRow extends RankedFreeAgent {
  /** His place among the same available players on the preseason line; null without one. */
  readonly preseasonRank: number | null;
  /** Places gained since the preseason line: positive is a rise. Null without one. */
  readonly rise: number | null;
  /** Risen far enough that the draft would have taken him had it known: see {@link isRising}. */
  readonly rising: boolean;
  readonly preseason: Projection | null;
}

/** Fewer places than this is the noise of a ranking, not a change of role. */
export const RISE_MIN_PLACES = 5;

/**
 * Whether a player has risen enough to be worth a look as a keeper: his place at least halved
 * since the preseason line, and by at least {@link RISE_MIN_PLACES} places. Halved rather than a
 * fixed number of places, because the top of a wire has little room to climb: first from eighth
 * is the climb of the season, while a hundredth from a hundred and fifteenth is nobody's. The bar
 * is a first guess, to be tuned once it has been read against a real wire.
 */
export function isRising(rank: number, preseasonRank: number | null): boolean {
  if (preseasonRank === null) {
    return false;
  }
  return preseasonRank >= 2 * rank && preseasonRank - rank >= RISE_MIN_PLACES;
}

/**
 * The players of one kind on both lines, best first on the rest of the season.
 *
 * <p>Both lines are ranked among the same available players, each on its own: a place is a
 * comparison with the rest of the wire, and the wire is the same players either way. The
 * preseason line is a whole season and the rest of the season is not, but every club has nearly
 * the same games left, so the order of the preseason lines is the order they would have had over
 * the games left, and it is the order that is compared.
 *
 * <p>`alongside` are lines scored in the same pool without taking a place: the user's own players,
 * so a pickup's score and the score of the player he would replace are on one scale. A category
 * league scores against the pool, so the two must be scored together to be compared.
 *
 * @param rank ranks lines by the league's scoring, best first, as the ranking engine does
 */
export function rankScout(
  players: readonly ScoutPlayer[],
  kind: ScoutKind,
  rank: (projections: Projection[]) => ScoredProjection[],
  scoreOf: (entry: ScoredProjection) => number,
  alongside: readonly Projection[] = [],
): ScoutRow[] {
  const own = players.filter((player) => player.freeAgent.projection.type === kind);
  const byPlayerId = new Map(own.map((player) => [player.freeAgent.projection.playerId, player]));

  const preseasonRanks = new Map<number, number>();
  rank(own.flatMap((player) => (player.preseason ? [player.preseason] : []))).forEach(
    (entry, index) => preseasonRanks.set(entry.projection.playerId, index + 1),
  );

  const rows: ScoutRow[] = [];
  const pool = [
    ...own.map((player) => player.freeAgent.projection),
    ...alongside.filter((line) => line.type === kind),
  ];
  for (const entry of rank(pool)) {
    const player = byPlayerId.get(entry.projection.playerId);
    if (!player) {
      continue;
    }
    const place = rows.length + 1;
    const preseasonRank = player.preseason
      ? (preseasonRanks.get(entry.projection.playerId) ?? null)
      : null;
    rows.push({
      player: player.freeAgent,
      line: player.freeAgent.projection,
      score: scoreOf(entry),
      rank: place,
      games: player.freeAgent.expectedGames,
      preseason: player.preseason,
      preseasonRank,
      rise: preseasonRank === null ? null : preseasonRank - place,
      rising: isRising(place, preseasonRank),
    });
  }
  return rows;
}

/** Ice time a game on a line, in seconds; undefined for a goalie or a line without it. */
export function toiPerGame(line: Projection | null): number | undefined {
  if (!line || line.type !== 'skater') {
    return undefined;
  }
  const toi = line.stats.utility.toiPerGame;
  return toi > 0 ? toi : undefined;
}
