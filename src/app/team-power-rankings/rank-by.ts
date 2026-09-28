import { YahooLeague$Params } from '../api/fn/league-summaries/yahoo-league';

/**
 * What a league is ranked against, as the page's dropdown holds it: the model, last season, or one
 * board by id. One string, so it can be an `<option>`'s value without a lookup table beside it.
 */
export type RankBy = 'model' | 'last_season' | `board:${string}`;

export function rankByBoard(projectionId: string): RankBy {
  return `board:${projectionId}`;
}

/** The board a choice names, or null where it names the model or last season. */
export function boardIdOf(rankBy: RankBy): string | null {
  return rankBy.startsWith('board:') ? rankBy.slice('board:'.length) : null;
}

/** The query a choice becomes: a board goes by its id alone, which is all the server needs. */
export function rankByParams(rankBy: RankBy): Pick<YahooLeague$Params, 'source' | 'projectionId'> {
  const projectionId = boardIdOf(rankBy);
  return projectionId ? { projectionId } : { source: rankBy };
}
