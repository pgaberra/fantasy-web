import { beforeEach, describe, expect, it } from 'vitest';
import { TierService } from './tier.service';
import { PositionFilterService } from './position-filter.service';
import { Player } from '../models/player.model';
import { SkaterPosition } from '../models/position.model';
import { GoalieStats, ScoredProjection, SkaterStats } from '../models/projection.model';
import { RosterSlots } from '../api/models/roster-slots';
import { TestBed } from '@angular/core/testing';

describe('TierService', () => {
  let service: TierService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TierService, PositionFilterService] });
    service = TestBed.inject(TierService);
  });

  /** Tier sizes implied by a set of cut points over a list of the given length. */
  const sizesOf = (breaks: readonly number[], length: number): number[] => {
    const bounds = [0, ...breaks, length];
    return bounds.slice(1).map((bound, index) => bound - bounds[index]);
  };

  describe('breaksFor', () => {
    it('breaks where the value falls away', () => {
      // Seven defencemen clustered, then a cliff, then another flat run: the break belongs
      // after the seventh, which is the case the whole feature exists for.
      const values = [90, 88, 86, 84, 82, 80, 78, 60, 58, 56, 54, 52];

      expect(service.breaksFor(values)).toContain(7);
    });

    it('finds no break in an evenly spaced list', () => {
      const values = Array.from({ length: 20 }, (_, index) => 100 - index * 2);

      // No gap stands out from its neighbours, so the only break is the max-tier-size
      // split, taken at the middle.
      expect(service.breaksFor(values)).toEqual([10]);
    });

    it('returns nothing for a short flat list, which needs no division', () => {
      expect(service.breaksFor([50, 50, 50, 50])).toEqual([]);
    });

    it('returns nothing for a list too short to have a gap', () => {
      expect(service.breaksFor([])).toEqual([]);
      expect(service.breaksFor([42])).toEqual([]);
    });

    it('ignores a gap that is only relatively large but absolutely negligible', () => {
      // A cliff of 200 dominates, so the 0.2 step at rank 12 is noise even though its
      // neighbours are flatter still.
      const values = [1000, 800, 600, 400, 200, 100, 99.9, 99.8, 99.7, 99.6, 99.5, 99.3, 99.2];

      expect(service.breaksFor(values)).not.toContain(12);
    });

    it('divides a long flat tier at its own largest gap', () => {
      const values = Array.from({ length: 30 }, (_, index) =>
        index < 15 ? 100 - index : 84.5 - index,
      );

      const sizes = sizesOf(service.breaksFor(values), values.length);

      expect(Math.max(...sizes)).toBeLessThanOrEqual(12);
    });

    it('rations the gap rule so a hacky list cannot spend the whole budget on it', () => {
      // A staircase: every third gap is a cliff, which would otherwise break on all ~16.
      const values = Array.from(
        { length: 50 },
        (_, index) => 500 - index * 2 - Math.floor(index / 3) * 40,
      );

      // Every break past the ninth is a size division, so each tier is within the cap.
      expect(sizesOf(service.breaksFor(values), values.length).every((size) => size <= 12)).toBe(
        true,
      );
    });

    /**
     * The shape that made the size cap worth guaranteeing. Staging's defensemen ran one clear
     * leader, then a long band flat enough that no gap inside it stood out, then a hackier
     * stretch further down. Rationing the division against the gap rule's budget let the hacky
     * bottom spend it and left the band standing as one 24-man tier.
     */
    it('divides a long flat band even when the hacky bottom used up the gap rule', () => {
      const band = [
        352.05, 343.4, 341.24, 340.73, 323.11, 312.61, 304.14, 301.57, 301.31, 289.43, 289.2,
        285.92, 280.04, 276.96, 272.1, 269.58, 267.57, 265.89, 264.88, 263.39, 263.06, 260.21,
        254.92,
      ];
      const hackyTail = [242.19, 240.9, 237.6, 235.61, 229.42, 220.18, 219.57, 217.45, 216.47];
      const values = [393.07, ...band, ...hackyTail];

      const sizes = sizesOf(service.breaksFor(values), values.length);

      expect(Math.max(...sizes)).toBeLessThanOrEqual(12);
    });

    it('divides a dead-flat list evenly by size', () => {
      const values = Array.from({ length: 30 }, () => 100);

      const sizes = sizesOf(service.breaksFor(values), values.length);

      expect(Math.max(...sizes)).toBeLessThanOrEqual(12);
      // Nothing distinguishes any rank from any other, so the divisions fall evenly.
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    });

    it('returns strictly increasing cut points inside the list', () => {
      const values = [100, 99, 98, 70, 69, 68, 40, 39, 20, 19, 18, 17, 5, 4, 3];

      const breaks = service.breaksFor(values);

      expect(breaks).toEqual([...breaks].sort((first, second) => first - second));
      expect(new Set(breaks).size).toBe(breaks.length);
      expect(breaks.every((cut) => cut >= 1 && cut < values.length)).toBe(true);
    });
  });

  describe('tiersByPosition', () => {
    const emptySkaterStats: SkaterStats = {
      utility: { gp: 0, toiPerGame: 0 },
      scoring: {
        stpg: 0,
        stpa: 0,
        stp: 0,
        hatTricks: 0,
        defPoints: 0,
        shifts: 0,
        toi: 0,
        goals: 0,
        assists: 0,
        points: 0,
        plusMinus: 0,
        pim: 0,
        ppg: 0,
        ppa: 0,
        ppp: 0,
        shg: 0,
        sha: 0,
        shp: 0,
        gwg: 0,
        sog: 0,
        shPct: 0,
        fw: 0,
        fl: 0,
        hits: 0,
        blocks: 0,
      },
    };

    const emptyGoalieStats: GoalieStats = {
      utility: { gp: 0 },
      scoring: {
        otl: 0,
        winPct: 0,
        toi: 0,
        gs: 0,
        w: 0,
        l: 0,
        sho: 0,
        sa: 0,
        sv: 0,
        ga: 0,
        gaa: 0,
        svPct: 0,
      },
    };

    const rosterSlots: RosterSlots = { c: 2, lw: 2, rw: 2, d: 4, util: 0, bn: 4, g: 2 };

    function skater(id: number, positions: SkaterPosition[]): Player {
      return {
        id,
        name: `Skater ${id}`,
        type: 'skater',
        positions: new Set(positions),
        stats: emptySkaterStats,
      };
    }

    function goalie(id: number): Player {
      return { id, name: `Goalie ${id}`, type: 'goalie', stats: emptyGoalieStats };
    }

    function scored(id: number, points: number, qualified = true): ScoredProjection {
      return {
        projection: { playerId: id, type: 'skater', stats: emptySkaterStats },
        score: { fantasyPoints: points, zScore: points },
        qualified,
      };
    }

    function scoredGoalie(id: number, points: number, qualified = true): ScoredProjection {
      return {
        projection: { playerId: id, type: 'goalie', stats: emptyGoalieStats },
        score: { fantasyPoints: points, zScore: points },
        qualified,
      };
    }

    it('tiers a dual-eligible player in both of his position lists', () => {
      // 1 is a C/LW. Among centres he trails two better ones; among left wings he leads.
      const players = new Map<number, Player>([
        [1, skater(1, ['C', 'LW'])],
        [2, skater(2, ['C'])],
        [3, skater(3, ['C'])],
        [4, skater(4, ['LW'])],
      ]);
      const ranked = [scored(2, 300), scored(3, 298), scored(1, 200), scored(4, 100)];

      const tiers = service.tiersByPosition({
        ranked,
        players,
        scoringType: 'points',
        leagueSize: 12,
        rosterSlots,
      });

      expect(tiers.get('C')!.tierByPlayerId.get(1)).toBe(2);
      expect(tiers.get('LW')!.tierByPlayerId.get(1)).toBe(1);
    });

    it('reports the strongest peer group as the best tier', () => {
      const players = new Map<number, Player>([
        [1, skater(1, ['C', 'LW'])],
        [2, skater(2, ['C'])],
        [3, skater(3, ['C'])],
        [4, skater(4, ['LW'])],
      ]);
      const ranked = [scored(2, 300), scored(3, 298), scored(1, 200), scored(4, 100)];

      const tiers = service.tiersByPosition({
        ranked,
        players,
        scoringType: 'points',
        leagueSize: 12,
        rosterSlots,
      });

      expect(service.bestTierFor(1, tiers)).toEqual({ position: 'LW', tier: 1 });
    });

    it('leaves an unqualified goalie out of the tiers', () => {
      const players = new Map<number, Player>([
        [1, goalie(1)],
        [2, goalie(2)],
        [3, goalie(3)],
      ]);
      // 3 has the best rate stats but sits below the games minimum, so he is ranked last
      // rather than by value and must not anchor a tier.
      const ranked = [scoredGoalie(1, 300), scoredGoalie(2, 200), scoredGoalie(3, 900, false)];

      const tiers = service.tiersByPosition({
        ranked,
        players,
        scoringType: 'category',
        leagueSize: 12,
        rosterSlots,
      });

      expect(tiers.get('G')!.tierByPlayerId.has(3)).toBe(false);
      expect(tiers.get('G')!.tierByPlayerId.get(1)).toBe(1);
    });

    it('leaves players beyond the tiered depth untiered', () => {
      const players = new Map<number, Player>();
      const ranked: ScoredProjection[] = [];
      for (let id = 1; id <= 200; id++) {
        players.set(id, skater(id, ['D']));
        ranked.push(scored(id, 500 - id));
      }

      const tiers = service.tiersByPosition({
        ranked,
        players,
        scoringType: 'points',
        leagueSize: 12,
        rosterSlots,
      });

      const d = tiers.get('D')!;
      expect(d.depth).toBeLessThan(200);
      expect(d.tierByPlayerId.has(1)).toBe(true);
      expect(d.tierByPlayerId.has(200)).toBe(false);
    });

    it('gives every tiered player a tier, numbered from one without gaps', () => {
      const players = new Map<number, Player>();
      const ranked: ScoredProjection[] = [];
      for (let id = 1; id <= 40; id++) {
        players.set(id, skater(id, ['RW']));
        ranked.push(scored(id, id <= 5 ? 400 - id * 2 : 200 - id));
      }

      const tiers = service.tiersByPosition({
        ranked,
        players,
        scoringType: 'points',
        leagueSize: 12,
        rosterSlots,
      });

      const rw = tiers.get('RW')!;
      const assigned = [...rw.tierByPlayerId.values()];
      expect(assigned.length).toBe(rw.depth);
      expect(Math.min(...assigned)).toBe(1);
      expect(new Set(assigned).size).toBe(Math.max(...assigned));
      expect(Math.max(...assigned)).toBe(rw.breaks.length + 1);
    });
  });
});
