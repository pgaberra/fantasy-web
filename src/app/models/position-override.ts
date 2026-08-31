import { Player } from './player.model';
import { SkaterPosition } from './position.model';

/**
 * The positions an owner has corrected by hand, keyed by player.
 *
 * Eligibility comes from one platform's player pool, and the platforms disagree: a skater Yahoo
 * lists at LW and RW may be LW only in ESPN. Only the owner knows which league they are drafting
 * for, so a projection carries their answer and everything downstream reads the corrected pool.
 */
export type PositionOverrides = ReadonlyMap<number, readonly SkaterPosition[]>;

/**
 * The player pool as this projection sees it. Applied once, where the pool is loaded, so the
 * filter, the row label, draft slot eligibility and a published share all agree without each
 * having to know overrides exist.
 */
export function applyPositionOverrides(players: Player[], overrides: PositionOverrides): Player[] {
  if (overrides.size === 0) {
    return players;
  }
  return players.map((player) => {
    if (player.type !== 'skater') {
      return player;
    }
    const corrected = overrides.get(player.id);
    return corrected ? { ...player, positions: new Set(corrected) } : player;
  });
}
