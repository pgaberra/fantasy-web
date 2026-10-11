import { Player } from '../../models/player.model';
import { ScoredProjection, ScoringType } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';

/** A slot on the lineup card: a skater position, or the crease. */
export type LineupSlot = 'C' | 'LW' | 'RW' | 'D' | 'G';

/**
 * The slots the card fills, in lineup order. Seven rather than a league's whole roster: the card
 * is the proof that the ranking is the visitor's, not a roster sheet, and seven rows fit beside
 * the headline at a laptop's height.
 */
export const LINEUP_SLOTS: readonly LineupSlot[] = ['C', 'C', 'LW', 'RW', 'D', 'D', 'G'];

/**
 * The weights the card offers, in the order they are shown: the six skater categories most
 * leagues score, then the two goalie ones. Everything else in the pool's line is left unscored on
 * the card, so what the visitor sees scored is what the weights row says.
 */
export const LINEUP_WEIGHT_KEYS: readonly ScoringStatKey[] = [
  'goals',
  'assists',
  'ppp',
  'sog',
  'hits',
  'blocks',
  'w',
  'sv',
];

/** One row of the card: the slot, and who fills it once the pool has been ranked. */
export interface LineupRow {
  readonly slot: LineupSlot;
  readonly player: Player | null;
  /** Fantasy points in a points league, the z-score in a category league; null until filled. */
  readonly score: number | null;
  readonly gp: number | null;
}

/**
 * Fills the slots from a ranking, best first: each slot takes the highest-ranked player still
 * unused who is eligible for it, so a centre who is also a winger goes to the first slot that
 * wants him and the next centre takes the one after. Goalies only ever fill the crease.
 */
export function fillLineup(
  ranked: readonly ScoredProjection[],
  playersById: ReadonlyMap<number, Player>,
  scoringType: ScoringType,
  slots: readonly LineupSlot[] = LINEUP_SLOTS,
): LineupRow[] {
  const used = new Set<number>();
  return slots.map((slot) => {
    for (const scored of ranked) {
      const player = playersById.get(scored.projection.playerId);
      if (!player || used.has(player.id) || !eligible(player, slot)) {
        continue;
      }
      used.add(player.id);
      return {
        slot,
        player,
        score: scoringType === 'points' ? scored.score.fantasyPoints : scored.score.zScore,
        gp: player.stats.utility.gp,
      };
    }
    return { slot, player: null, score: null, gp: null };
  });
}

function eligible(player: Player, slot: LineupSlot): boolean {
  if (slot === 'G') {
    return player.type === 'goalie';
  }
  return player.type === 'skater' && player.positions.has(slot);
}

/** The slots whose player changed between two fillings, by index: what the card highlights. */
export function changedSlots(before: readonly LineupRow[], after: readonly LineupRow[]): number[] {
  return after.flatMap((row, index) =>
    row.player?.id === before[index]?.player?.id ? [] : [index],
  );
}
