import { Projection, ScoredProjection } from '../models/projection.model';
import { compareStatValues } from '../models/sorting';
import {
  FreeAgentSort,
  FreeAgentSortKey,
  nextSort,
  RANKED_ORDER,
  RankedFreeAgent,
  sortFreeAgents,
} from '../streamer-planner/planner-free-agents';
import { ScoutPlayer } from '../services/fa-scout.service';

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
 * Every available player, skaters and goalies in one list, on both lines, best first on the rest
 * of the season. One list as the planner's is, so a position filter narrows it without moving
 * anyone's place: the engine scores a skater against skaters and a goalie against goalies, so the
 * two are on one scale.
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
  rank: (projections: Projection[]) => ScoredProjection[],
  scoreOf: (entry: ScoredProjection) => number,
  alongside: readonly Projection[] = [],
): ScoutRow[] {
  const byPlayerId = new Map(
    players.map((player) => [player.freeAgent.projection.playerId, player]),
  );

  const preseasonRanks = new Map<number, number>();
  rank(players.flatMap((player) => (player.preseason ? [player.preseason] : []))).forEach(
    (entry, index) => preseasonRanks.set(entry.projection.playerId, index + 1),
  );

  const rows: ScoutRow[] = [];
  const pool = [...players.map((player) => player.freeAgent.projection), ...alongside];
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

// --- Sorting the list ----------------------------------------------------------------------------

/** A column the list can be sorted by: the planner's, and the rise. */
export type ScoutSortKey = FreeAgentSortKey | 'rise';

export interface ScoutSort {
  readonly key: ScoutSortKey;
  readonly descending: boolean;
}

/** The list as ranked: best first on the rest of the season, which is what the # column counts. */
export const SCOUT_RANKED_ORDER: ScoutSort = RANKED_ORDER;

/**
 * Sorts by a column, best first, whichever end of the scale that is: the furthest risen first, and
 * every other column as the planner sorts it. The same column again turns the order round.
 */
export function nextScoutSort(current: ScoutSort, key: ScoutSortKey): ScoutSort {
  if (current.key === key) {
    return { key, descending: !current.descending };
  }
  if (key === 'rise') {
    return { key, descending: true };
  }
  // Another column than the current: the planner reads nothing of the current order but its key.
  return nextSort(current as FreeAgentSort, key);
}

/**
 * The list in the order asked for. A player the column says nothing about, as a rise without a
 * preseason line, goes last whichever way it points, and players level on it keep their ranked
 * order, as in the planner.
 */
export function sortScout(rows: readonly ScoutRow[], sort: ScoutSort): readonly ScoutRow[] {
  if (sort.key !== 'rise') {
    return sortFreeAgents(rows, { key: sort.key, descending: sort.descending });
  }
  const sign = sort.descending ? -1 : 1;
  return [...rows].sort((a, b) => compareStatValues(a.rise, b.rise, sign) || a.rank - b.rank);
}
