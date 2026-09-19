import { MockBuilder, MockRender } from 'ng-mocks';
import { ProjectionRankingService, RankingInput } from './projection-ranking.service';
import { ProjectionCalculationService } from './projection-calculation.service';
import { GoalieProjection, ScoringType } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS, ScoringStatKey } from '../models/stat-key.model';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import { DEFAULT_STAT_WEIGHTS } from '../draft-projection/projection-defaults';

/** A goalie's season whose counts agree with his rates, at a full sixty minutes a game. */
const goalieSeason = (
  playerId: number,
  gp: number,
  gaa: number,
  svPct: number,
  wins: number,
): GoalieProjection => {
  const ga = gaa * gp;
  const sa = ga / (1 - svPct);
  return {
    type: 'goalie',
    playerId,
    stats: {
      scoring: {
        ...(Object.fromEntries(GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0])) as Record<
          (typeof GOALIE_SCORING_STAT_KEYS)[number],
          number
        >),
        gs: gp,
        w: wins,
        toi: gp * 3600,
        ga,
        gaa,
        sa,
        sv: sa - ga,
        svPct,
      },
      utility: { gp },
    },
  };
};

// The starter and the backup have the same GAA and save percentage; the other two set the league
// rate below theirs.
const STARTER = goalieSeason(1, 60, 2.4, 0.918, 30);
const BACKUP = goalieSeason(2, 30, 2.4, 0.918, 30);
const FIELD = [
  BACKUP,
  STARTER,
  goalieSeason(3, 55, 3.1, 0.898, 24),
  goalieSeason(4, 45, 2.9, 0.903, 22),
];

const input = (scoringType: ScoringType, categories: ScoringStatKey[]): RankingInput => ({
  projections: FIELD,
  scoringType,
  statWeights: { ...DEFAULT_STAT_WEIGHTS, gaa: -2, svPct: 50 },
  activeScoringColumns: new Set(categories),
  leagueSize: 12,
  rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 0, bn: 4, g: 2 },
  minGoalieGames: 0,
  decimalSettings: DEFAULT_DECIMAL_SETTINGS,
});

describe('ProjectionRankingService', () => {
  beforeEach(() => MockBuilder(ProjectionRankingService).keep(ProjectionCalculationService));

  const getService = () => MockRender(ProjectionRankingService).point.componentInstance;

  describe('in a category league', () => {
    const categories: ScoringStatKey[] = ['w', 'gaa', 'svPct'];

    it('ranks a 60-game goalie above a 30-game goalie with the same ratios and wins', () => {
      const ranked = getService().rankOverall(input('category', categories));

      const order = ranked.map((scored) => scored.projection.playerId);
      expect(order.indexOf(STARTER.playerId)).toBeLessThan(order.indexOf(BACKUP.playerId));
      const byId = new Map(ranked.map((scored) => [scored.projection.playerId, scored]));
      expect(byId.get(STARTER.playerId)!.score.zScore).toBeGreaterThan(
        byId.get(BACKUP.playerId)!.score.zScore,
      );
    });

    it("breaks each player's ranked z-score into categories that sum back to it", () => {
      const service = getService();
      const rankingInput = input('category', categories);

      const ranked = service.rankOverall(rankingInput);
      const contributions = service.contributionsByPlayerId(rankingInput);

      for (const scored of ranked) {
        const byCategory = contributions.get(scored.projection.playerId)!;
        expect(new Set(Object.keys(byCategory))).toEqual(new Set(['w', 'gaa', 'svPct']));
        const sum = Object.values(byCategory).reduce((total, value) => total + value, 0);
        expect(sum).toBeCloseTo(scored.score.zScore, 10);
      }
    });
  });

  describe('in a points league', () => {
    it('scores a rate by its stat weight alone, whatever the games behind it', () => {
      const service = getService();
      const rankingInput = input('points', ['gaa', 'svPct']);

      const ranked = service.rankOverall(rankingInput);
      const contributions = service.contributionsByPlayerId(rankingInput);

      const byId = new Map(ranked.map((scored) => [scored.projection.playerId, scored]));
      const expected = -2 * 2.4 + 50 * 0.918;
      expect(byId.get(STARTER.playerId)!.score.fantasyPoints).toBeCloseTo(expected, 10);
      expect(byId.get(BACKUP.playerId)!.score.fantasyPoints).toBeCloseTo(expected, 10);
      expect(contributions.get(STARTER.playerId)).toEqual(contributions.get(BACKUP.playerId));
    });
  });
});
