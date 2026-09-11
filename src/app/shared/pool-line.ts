import { Player } from '../models/player.model';
import { Projection } from '../models/projection.model';

/** The line a player starts from before anyone edits it: their own stats from the pool. */
export function ownLine(player: Player): Projection {
  return player.type === 'skater'
    ? { type: 'skater', playerId: player.id, stats: player.stats }
    : { type: 'goalie', playerId: player.id, stats: player.stats };
}

/**
 * A line from somewhere other than the pool (a saved board, the model's seed) as the pool can
 * draw it.
 *
 * <p>A line holds the stats of the kind of player it was written for, while a row draws the cells
 * of the kind the pool says the player is. The two do not always agree: the model reads a player's
 * type from the NHL and the pool reads it from ESPN, which has listed a goalie as a centre, and a
 * saved board keeps the type it was saved with. A line of the other kind holds none of the stats
 * its cells read, and the first one to format a value threw (Sentry FANTASY-WEB-D). The player's
 * own line is the only one of the right shape. A player the pool does not hold is left as it is.
 */
export function squaredWithPool(projection: Projection, player: Player | undefined): Projection {
  return !player || player.type === projection.type ? projection : ownLine(player);
}
