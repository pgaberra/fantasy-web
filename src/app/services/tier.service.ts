import { inject, Injectable } from '@angular/core';
import { Player } from '../models/player.model';
import { PositionFilter, ScoredProjection, ScoringType } from '../models/projection.model';
import { RosterSlots } from '../api/models/roster-slots';
import { PositionFilterService } from './position-filter.service';

/** The position lists a manager tiers. A player appears in every list he is eligible for. */
export type TierPosition = 'C' | 'LW' | 'RW' | 'D' | 'G';

export const TIER_POSITIONS: readonly TierPosition[] = ['C', 'LW', 'RW', 'D', 'G'];

/**
 * A gap counts as a tier break when it is at least this many times the typical gap among its
 * neighbours. The comparison is deliberately local: value curves are steep at the top and flat
 * in the middle, so one threshold across the whole list would put every break among the elite
 * and none where the round-to-round decisions actually get made.
 */
const GAP_FACTOR = 1.8;

/** How many gaps either side of a candidate make up "its neighbours". */
const NEIGHBOURHOOD = 5;

/**
 * A gap must also be this share of the tiered range to break, so a dead-flat stretch does not
 * produce breaks out of rounding noise just because its neighbours are flatter still.
 */
const MIN_SPREAD_SHARE = 0.005;

/** A tier longer than this is split at its own largest gap: a 30-man tier helps nobody. */
const MAX_TIER_SIZE = 12;

/** Hard cap, so a position's list stays something a manager can hold in his head. */
const MAX_TIERS = 12;

/** Tier down to this multiple of the position's draftable pool; below it nobody is choosing. */
const DEPTH_SLACK = 1.5;

const MIN_DEPTH = 10;
const MAX_DEPTH = 120;

export interface PositionTiers {
  /**
   * Rank cut points, ascending: [2, 4, 9] means tier 1 is the top two, tier 2 the next two,
   * tier 3 the next five. Never contains the depth itself.
   */
  readonly breaks: readonly number[];
  /** Tier number (1-based) per player. Players past the depth are absent. */
  readonly tierByPlayerId: ReadonlyMap<number, number>;
  /** How many of the position's players were tiered. */
  readonly depth: number;
}

export interface TierInput {
  /** The pool ranked by projected value, descending — ProjectionRankingService.rankOverall. */
  readonly ranked: readonly ScoredProjection[];
  readonly players: Map<number, Player>;
  readonly scoringType: ScoringType;
  readonly leagueSize: number;
  readonly rosterSlots: RosterSlots;
}

/** The tier a player holds at one of his eligible positions. */
export interface PlayerTier {
  readonly position: TierPosition;
  readonly tier: number;
}

/** A tier rendered next to a player: the short chip and what it means in full. */
export interface TierBadge {
  readonly label: string;
  readonly tooltip: string;
}

/** What a position's players are called, for copy that names the peer group. */
const PEER_GROUP: Record<TierPosition, { one: string; many: string }> = {
  C: { one: 'center', many: 'centers' },
  LW: { one: 'left wing', many: 'left wings' },
  RW: { one: 'right wing', many: 'right wings' },
  D: { one: 'defenseman', many: 'defensemen' },
  G: { one: 'goalie', many: 'goalies' },
};

/**
 * Groups each position's ranked players into tiers by finding the drop-offs in projected value.
 *
 * A tier break goes where the value falls away — if there is a real gap between the seventh and
 * the eighth defenceman, the tier ends after the seventh — which is what makes "one left in this
 * tier" worth acting on during a draft.
 *
 * Tiers are per position, not per player: a C/LW-eligible skater is tiered in both lists and can
 * sit higher in one than in the other, because only the peer group differs.
 */
@Injectable({ providedIn: 'root' })
export class TierService {
  private readonly positionFilterService = inject(PositionFilterService);

  tiersByPosition(input: TierInput): Map<TierPosition, PositionTiers> {
    const byPosition = new Map<TierPosition, PositionTiers>();
    for (const position of TIER_POSITIONS) {
      byPosition.set(position, this.tiersForPosition(input, position));
    }
    return byPosition;
  }

  /**
   * The best tier a player holds across the positions he is eligible for, for showing one tier
   * when no position filter narrows the list. "Best" is the strongest peer group he belongs to —
   * a tier 1 left wing who is only a tier 3 centre is drafted as a left wing.
   */
  bestTierFor(
    playerId: number,
    tiers: ReadonlyMap<TierPosition, PositionTiers>,
  ): PlayerTier | null {
    let best: PlayerTier | null = null;
    for (const position of TIER_POSITIONS) {
      const tier = tiers.get(position)?.tierByPlayerId.get(playerId);
      if (tier !== undefined && (best === null || tier < best.tier)) {
        best = { position, tier };
      }
    }
    return best;
  }

  /** The tier list a single-position filter selects, or null for ALL and SKATER. */
  tierPositionForFilter(filter: PositionFilter): TierPosition | null {
    return filter === 'ALL' || filter === 'SKATER' ? null : filter;
  }

  /**
   * The chip to show beside a player. With a position in hand it is that list's tier; without one
   * it is his best tier, labelled with the position it belongs to so the peer group is never in
   * doubt. Null for a player past the tiered depth.
   */
  badgeFor(
    playerId: number,
    tiers: ReadonlyMap<TierPosition, PositionTiers>,
    position: TierPosition | null,
  ): TierBadge | null {
    if (position) {
      const tier = tiers.get(position)?.tierByPlayerId.get(playerId);
      return tier === undefined
        ? null
        : { label: `T${tier}`, tooltip: `Tier ${tier} among ${PEER_GROUP[position].many}` };
    }
    const best = this.bestTierFor(playerId, tiers);
    return best === null
      ? null
      : {
          label: `${best.position} T${best.tier}`,
          tooltip:
            `Tier ${best.tier} among ${PEER_GROUP[best.position].many}, ` +
            `the strongest of this player's positions`,
        };
  }

  /** What a position's players are called, singular or plural, for copy that counts them. */
  peerGroup(position: TierPosition, count: number): string {
    const group = PEER_GROUP[position];
    return count === 1 ? group.one : group.many;
  }

  /**
   * Cut points for one position's descending values, as "the rank after which a tier ends".
   * Public so the algorithm can be tested on a list of numbers rather than a pool of players.
   */
  breaksFor(values: readonly number[]): number[] {
    if (values.length < 2) {
      return [];
    }
    const gaps: number[] = [];
    for (let i = 0; i < values.length - 1; i++) {
      gaps.push(Math.max(0, values[i] - values[i + 1]));
    }
    const spread = Math.max(0, values[0] - values[values.length - 1]);
    if (spread === 0) {
      return [];
    }
    const minGap = spread * MIN_SPREAD_SHARE;

    const chosen = gaps
      .map((gap, index) => ({ rank: index + 1, score: gap / this.neighbourGap(gaps, index), gap }))
      .filter((candidate) => candidate.gap >= minGap && candidate.score >= GAP_FACTOR)
      .sort((first, second) => second.score - first.score)
      .slice(0, MAX_TIERS - 1)
      .map((candidate) => candidate.rank)
      .sort((first, second) => first - second);

    return this.splitOversized(chosen, gaps, values.length);
  }

  private tiersForPosition(input: TierInput, position: TierPosition): PositionTiers {
    const isPoints = input.scoringType === 'points';
    // Unqualified goalies are deliberately ranked last rather than by value, so they would
    // anchor a meaningless tier. They are left untiered instead.
    const eligible = input.ranked.filter(
      (scored) =>
        scored.qualified &&
        this.positionFilterService.matches(scored.projection, input.players, position),
    );
    const depth = Math.min(eligible.length, this.depthFor(position, input));
    const values = eligible
      .slice(0, depth)
      .map((scored) => (isPoints ? scored.score.fantasyPoints : scored.score.zScore));

    const breaks = this.breaksFor(values);
    const tierByPlayerId = new Map<number, number>();
    let tier = 1;
    let nextBreak = 0;
    for (let rank = 1; rank <= depth; rank++) {
      if (nextBreak < breaks.length && rank > breaks[nextBreak]) {
        tier++;
        nextBreak++;
      }
      tierByPlayerId.set(eligible[rank - 1].projection.playerId, tier);
    }
    return { breaks, tierByPlayerId, depth };
  }

  /**
   * How deep to tier: the position's draftable pool with slack. Flex and bench slots are shared
   * out across the four skater positions, since any of them can fill one.
   */
  private depthFor(position: TierPosition, input: TierInput): number {
    const roster = input.rosterSlots;
    const slots =
      position === 'G'
        ? roster.g
        : roster[position.toLowerCase() as 'c' | 'lw' | 'rw' | 'd'] + (roster.util + roster.bn) / 4;
    const pool = input.leagueSize * slots * DEPTH_SLACK;
    return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.round(pool)));
  }

  /**
   * The typical gap around a candidate, excluding the candidate itself — a median, so that one
   * large neighbour cannot mask a break. Falls back to a positive floor so a flat neighbourhood
   * does not divide by zero; the minimum-gap rule is what keeps noise out in that case.
   */
  private neighbourGap(gaps: readonly number[], index: number): number {
    const neighbours: number[] = [];
    const from = Math.max(0, index - NEIGHBOURHOOD);
    const to = Math.min(gaps.length - 1, index + NEIGHBOURHOOD);
    for (let i = from; i <= to; i++) {
      if (i !== index) {
        neighbours.push(gaps[i]);
      }
    }
    if (neighbours.length === 0) {
      return Number.MIN_VALUE;
    }
    neighbours.sort((first, second) => first - second);
    const middle = Math.floor(neighbours.length / 2);
    const median =
      neighbours.length % 2 === 0
        ? (neighbours[middle - 1] + neighbours[middle]) / 2
        : neighbours[middle];
    return median > 0 ? median : Number.MIN_VALUE;
  }

  /** Divides any tier longer than MAX_TIER_SIZE at its own largest gap, while there is room. */
  private splitOversized(breaks: number[], gaps: readonly number[], depth: number): number[] {
    const result = [...breaks];
    while (result.length + 1 < MAX_TIERS) {
      const bounds = [0, ...result, depth];
      let widest = -1;
      let widestSize = MAX_TIER_SIZE;
      for (let i = 0; i < bounds.length - 1; i++) {
        const size = bounds[i + 1] - bounds[i];
        if (size > widestSize) {
          widest = i;
          widestSize = size;
        }
      }
      if (widest === -1) {
        return result;
      }
      const from = bounds[widest];
      const to = bounds[widest + 1];
      const middle = (from + to) / 2;
      let bestRank = from + 1;
      let bestGap = -1;
      let bestOffset = Number.POSITIVE_INFINITY;
      for (let rank = from + 1; rank < to; rank++) {
        const gap = gaps[rank - 1];
        const offset = Math.abs(rank - middle);
        // Ties go to the rank nearest the middle. Breaking at the first of several equal gaps
        // instead would shave a one-man tier off the front and leave the rest still oversized,
        // so a flat stretch came out as a run of tiers of one.
        if (gap > bestGap || (gap === bestGap && offset < bestOffset)) {
          bestGap = gap;
          bestOffset = offset;
          bestRank = rank;
        }
      }
      result.push(bestRank);
      result.sort((first, second) => first - second);
    }
    return result;
  }
}
