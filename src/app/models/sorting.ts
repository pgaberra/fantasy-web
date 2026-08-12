import { Projection, SortColumn, SortDirection } from './projection.model';
import { LOWER_IS_BETTER_SCORING_STAT_KEYS, RATE_STAT_KEYS, StatKey } from './stat-key.model';

/**
 * Which way a column sorts the first time it is clicked: best-first, whichever end of the scale
 * that is. For a name, best-first is alphabetical.
 *
 * Descending is wrong for GAA — clicking it to find the best goalies would answer with the worst.
 * But it stays right for the other stats a low number flatters, because they are running totals:
 * fewest goals against and fewest losses both belong to whoever barely played, so opening them at
 * the low end would answer with the goalies who never dress. Only a rate is low on its own merits,
 * which is why the ascending default is the intersection of the two sets rather than either one.
 *
 * Clicking the column a second time still flips the direction, so the other end is never more than
 * one click away. This is the reason the header menu needs no explicit sort commands.
 */
export function defaultSortDirection(column: SortColumn): SortDirection {
  if (column === 'name') {
    return 'asc';
  }
  const lowerIsBetter = (LOWER_IS_BETTER_SCORING_STAT_KEYS as ReadonlySet<string>).has(column);
  const isRate = (RATE_STAT_KEYS as readonly string[]).includes(column);
  return lowerIsBetter && isRate ? 'asc' : 'desc';
}

/**
 * The value a player sorts by, or `null` where the stat does not apply to them — a skater has no
 * goals against, which is not the same as conceding none.
 *
 * A rate is also absent from anyone with no games to rate: a goalie projected for none has a GAA
 * of 0 in the data, and without this the one column that opens ascending would answer "who
 * concedes fewest" with every goalie who never dresses.
 */
export function statValueOf(projection: Projection, key: StatKey): number | null {
  const scoring = projection.stats.scoring as Record<string, number>;
  const utility = projection.stats.utility as Record<string, number>;
  const value = scoring[key] ?? utility[key];
  if (typeof value !== 'number') {
    return null;
  }
  const isRate = (RATE_STAT_KEYS as readonly string[]).includes(key);
  return isRate && !utility['gp'] ? null : value;
}

/**
 * Orders two sort values, sinking the players the stat does not apply to whichever way the column
 * is pointing. Treating an absent stat as 0 only stayed invisible while every column sorted
 * descending: ascending, it would answer "which goalies concede fewest" with a screen of skaters.
 *
 * Returns 0 for a tie, which callers break by fantasy value.
 */
export function compareStatValues(
  first: number | null,
  second: number | null,
  sign: number,
): number {
  if (first === null || second === null) {
    if (first === second) {
      return 0;
    }
    return first === null ? 1 : -1;
  }
  return sign * (first - second);
}
