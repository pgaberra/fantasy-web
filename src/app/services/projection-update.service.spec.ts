import { MockBuilder, MockRender } from 'ng-mocks';
import { ProjectionUpdateService } from './projection-update.service';
import { GoalieProjection, Projection, SkaterProjection } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { ScaleConfig } from '../draft-projection/projection-settings-section/model';

const makeSkaterProjection = (playerId: number, toiPerGame = 1200, gp = 82): SkaterProjection => ({
  type: 'skater',
  playerId,
  stats: {
    scoring: {
      goals: 10,
      assists: 20,
      points: 30,
      plusMinus: 5,
      pim: 2,
      ppg: 3,
      ppa: 4,
      ppp: 7,
      shg: 1,
      sha: 0,
      shp: 1,
      gwg: 2,
      sog: 100,
      shPct: 10,
      fw: 0,
      fl: 0,
      hits: 50,
      blocks: 30,
    },
    utility: { toiPerGame, gp },
  },
});

const makeGoalieProjection = (playerId: number, gp = 60): GoalieProjection => ({
  type: 'goalie',
  playerId,
  stats: {
    scoring: { gs: 55, w: 30, l: 20, sho: 5, sa: 1500, sv: 1440, ga: 60, gaa: 2.5, svPct: 0.92 },
    utility: { gp },
  },
});

const skaterScaleSettings: Record<SkaterUtilityStatKey, ScaleConfig> = {
  toiPerGame: { scale: true, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
  gp: { scale: true, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
};

const skaterNoScaleSettings: Record<SkaterUtilityStatKey, ScaleConfig> = {
  toiPerGame: { scale: false, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
  gp: { scale: false, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
};

const goalieScaleSettings: Record<SkaterUtilityStatKey, ScaleConfig> = {
  toiPerGame: { scale: true, scalableStats: new Set<ScoringStatKey>(['gs', 'w', 'sv', 'sa']) },
  gp: { scale: true, scalableStats: new Set<ScoringStatKey>(['gs', 'w', 'sv', 'sa']) },
};

const goalieNoScaleSettings: Record<SkaterUtilityStatKey, ScaleConfig> = {
  toiPerGame: { scale: false, scalableStats: new Set<ScoringStatKey>(['gs', 'w', 'sv', 'sa']) },
  gp: { scale: false, scalableStats: new Set<ScoringStatKey>(['gs', 'w', 'sv', 'sa']) },
};

describe('ProjectionUpdateService', () => {
  beforeEach(() => MockBuilder(ProjectionUpdateService));

  const getService = () => MockRender(ProjectionUpdateService).point.componentInstance;

  describe('applyToiDelta', () => {
    it('should increment toiPerGame by the given delta', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 60, skaterNoScaleSettings);
      expect((result[0] as SkaterProjection).stats.utility.toiPerGame).toEqual(1260);
    });

    it('should decrement toiPerGame by the given delta', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, -60, skaterNoScaleSettings);
      expect((result[0] as SkaterProjection).stats.utility.toiPerGame).toEqual(1140);
    });

    it('should clamp toiPerGame to 0 when delta would make it negative', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 30)];
      const result = service.applyToiDelta(projections, 1, -60, skaterNoScaleSettings);
      expect((result[0] as SkaterProjection).stats.utility.toiPerGame).toEqual(0);
    });

    it('should not affect projections for other players', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200), makeSkaterProjection(2, 900)];
      const result = service.applyToiDelta(projections, 1, 60, skaterNoScaleSettings);
      expect((result[1] as SkaterProjection).stats.utility.toiPerGame).toEqual(900);
    });

    it('should scale scoring stats when scale is enabled', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 600, skaterScaleSettings);
      const ratio = 1800 / 1200;
      expect((result[0] as SkaterProjection).stats.scoring.goals).toBeCloseTo(10 * ratio);
      expect((result[0] as SkaterProjection).stats.scoring.assists).toBeCloseTo(20 * ratio);
    });

    it('should not scale stats outside the scalable set', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 600, skaterScaleSettings);
      expect((result[0] as SkaterProjection).stats.scoring.shPct).toEqual(10);
    });

    it('should not scale when toiPerGame is 0', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 0)];
      const result = service.applyToiDelta(projections, 1, 60, skaterScaleSettings);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('should not scale when scale setting is disabled', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 600, skaterNoScaleSettings);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('should not modify goalie projections in a mixed list', () => {
      const service = getService();
      const projections: Projection[] = [
        makeSkaterProjection(1, 1200),
        makeGoalieProjection(2, 60),
      ];
      const result = service.applyToiDelta(projections, 2, 60, skaterScaleSettings);
      expect(result[1].stats.utility.gp).toEqual(60);
    });
  });

  describe('applyStatValue - skater', () => {
    it('should update a scoring stat directly without scaling', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1)];
      const result = service.applyStatValue(projections, 1, 'goals', 25, skaterScaleSettings);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(25);
      expect((result[0] as SkaterProjection).stats.scoring.assists).toEqual(20);
    });

    it('should update a utility stat and scale scoring when scale is enabled', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyStatValue(
        projections,
        1,
        'toiPerGame',
        1800,
        skaterScaleSettings,
      );
      const ratio = 1800 / 1200;
      expect((result[0] as SkaterProjection).stats.utility.toiPerGame).toEqual(1800);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toBeCloseTo(10 * ratio);
      expect((result[0] as SkaterProjection).stats.scoring.assists).toBeCloseTo(20 * ratio);
    });

    it('should update a utility stat without scaling when scale is disabled', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyStatValue(
        projections,
        1,
        'toiPerGame',
        1800,
        skaterNoScaleSettings,
      );
      expect((result[0] as SkaterProjection).stats.utility.toiPerGame).toEqual(1800);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('should not scale when the old utility value is 0', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 0)];
      const result = service.applyStatValue(
        projections,
        1,
        'toiPerGame',
        1200,
        skaterScaleSettings,
      );
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('should not affect projections for other players', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1), makeSkaterProjection(2)];
      const result = service.applyStatValue(projections, 1, 'goals', 99, skaterScaleSettings);
      expect((result[1] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('should not scale stats outside the scalable set when updating a utility stat', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200)];
      const result = service.applyStatValue(
        projections,
        1,
        'toiPerGame',
        2400,
        skaterScaleSettings,
      );
      expect((result[0] as SkaterProjection).stats.scoring.shPct).toEqual(10);
    });
  });

  describe('applyStatValue - goalie', () => {
    it('should update a goalie scoring stat directly without scaling', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1)];
      const result = service.applyStatValue(projections, 1, 'w', 40, goalieScaleSettings);
      expect((result[0] as GoalieProjection).stats.scoring.w).toEqual(40);
      expect((result[0] as GoalieProjection).stats.scoring.l).toEqual(20);
    });

    it('should update goalie gp and scale scoring stats when scale is enabled', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 60)];
      const result = service.applyStatValue(projections, 1, 'gp', 80, goalieScaleSettings);
      const ratio = 80 / 60;
      expect((result[0] as GoalieProjection).stats.utility.gp).toEqual(80);
      expect((result[0] as GoalieProjection).stats.scoring.gs).toBeCloseTo(55 * ratio);
      expect((result[0] as GoalieProjection).stats.scoring.w).toBeCloseTo(30 * ratio);
    });

    it('should update goalie gp without scaling when scale is disabled', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 60)];
      const result = service.applyStatValue(projections, 1, 'gp', 80, goalieNoScaleSettings);
      expect((result[0] as GoalieProjection).stats.utility.gp).toEqual(80);
      expect((result[0] as GoalieProjection).stats.scoring.w).toEqual(30);
    });

    it('should not scale goalie stats outside the scalable set', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 60)];
      const result = service.applyStatValue(projections, 1, 'gp', 80, goalieScaleSettings);
      expect((result[0] as GoalieProjection).stats.scoring.svPct).toBeCloseTo(0.92);
      expect((result[0] as GoalieProjection).stats.scoring.gaa).toBeCloseTo(2.5);
    });

    it('should not scale when old gp is 0', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 0)];
      const result = service.applyStatValue(projections, 1, 'gp', 60, goalieScaleSettings);
      expect((result[0] as GoalieProjection).stats.scoring.w).toEqual(30);
    });

    it('should not affect other players in a mixed list', () => {
      const service = getService();
      const projections: Projection[] = [makeSkaterProjection(1), makeGoalieProjection(2)];
      const result = service.applyStatValue(projections, 2, 'w', 40, goalieScaleSettings);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
      expect((result[1] as GoalieProjection).stats.scoring.w).toEqual(40);
    });
  });

  describe('applyFullSeasonGames', () => {
    it('sets every skater to a full 84-game season', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 82), makeSkaterProjection(2, 1200, 70)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 0);
      expect((result[0] as SkaterProjection).stats.utility.gp).toEqual(84);
      expect((result[1] as SkaterProjection).stats.utility.gp).toEqual(84);
    });

    it("scales a skater's scalable stats by 84 / old GP", () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 82)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 0);
      const ratio = 84 / 82;
      expect((result[0] as SkaterProjection).stats.scoring.goals).toBeCloseTo(10 * ratio);
      expect((result[0] as SkaterProjection).stats.scoring.assists).toBeCloseTo(20 * ratio);
    });

    it('leaves stats outside the scalable set untouched for skaters', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 82)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 0);
      expect((result[0] as SkaterProjection).stats.scoring.shPct).toEqual(10);
    });

    it('scales goalie games proportionally (×84/82), rounded — 42 becomes 43', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 42)];
      const result = service.applyFullSeasonGames(projections, goalieScaleSettings, true, 0);
      expect((result[0] as GoalieProjection).stats.utility.gp).toEqual(43);
    });

    it("scales a goalie's scalable stats by the same games ratio", () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 42)];
      const result = service.applyFullSeasonGames(projections, goalieScaleSettings, true, 0);
      const ratio = 43 / 42;
      expect((result[0] as GoalieProjection).stats.scoring.w).toBeCloseTo(30 * ratio);
      expect((result[0] as GoalieProjection).stats.scoring.sv).toBeCloseTo(1440 * ratio);
    });

    it('leaves goalie rate stats untouched', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 42)];
      const result = service.applyFullSeasonGames(projections, goalieScaleSettings, true, 0);
      expect((result[0] as GoalieProjection).stats.scoring.svPct).toBeCloseTo(0.92);
      expect((result[0] as GoalieProjection).stats.scoring.gaa).toBeCloseTo(2.5);
    });

    it('sets GP but does not scale any stats when scaleStats is off', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 82)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, false, 0);
      expect((result[0] as SkaterProjection).stats.utility.gp).toEqual(84);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('sets GP but skips scaling for players below the minimum games threshold', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 15), makeSkaterProjection(2, 1200, 60)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 20);
      // Player 1 (15 GP < 20) keeps its raw stats; player 2 (60 GP >= 20) scales.
      expect((result[0] as SkaterProjection).stats.utility.gp).toEqual(84);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
      expect((result[1] as SkaterProjection).stats.utility.gp).toEqual(84);
      expect((result[1] as SkaterProjection).stats.scoring.goals).toBeCloseTo(10 * (84 / 60));
    });

    it('scales a player exactly at the minimum games threshold', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 20)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 20);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toBeCloseTo(10 * (84 / 20));
    });

    it('leaves a goalie with zero games at zero (no divide-by-zero)', () => {
      const service = getService();
      const projections: Projection[] = [makeGoalieProjection(1, 0)];
      const result = service.applyFullSeasonGames(projections, goalieScaleSettings, true, 0);
      expect((result[0] as GoalieProjection).stats.utility.gp).toEqual(0);
      expect((result[0] as GoalieProjection).stats.scoring.w).toEqual(30);
    });

    it('sets a skater with zero games to 84 without scaling', () => {
      const service = getService();
      const projections = [makeSkaterProjection(1, 1200, 0)];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 0);
      expect((result[0] as SkaterProjection).stats.utility.gp).toEqual(84);
      expect((result[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });

    it('handles a mixed skater/goalie list in one pass', () => {
      const service = getService();
      const projections: Projection[] = [
        makeSkaterProjection(1, 1200, 82),
        makeGoalieProjection(2, 42),
      ];
      const result = service.applyFullSeasonGames(projections, skaterScaleSettings, true, 0);
      expect((result[0] as SkaterProjection).stats.utility.gp).toEqual(84);
      expect((result[1] as GoalieProjection).stats.utility.gp).toEqual(43);
    });

    it('does not mutate the input projections', () => {
      const service = getService();
      const projections: Projection[] = [makeSkaterProjection(1, 1200, 82)];
      service.applyFullSeasonGames(projections, skaterScaleSettings, true, 0);
      expect((projections[0] as SkaterProjection).stats.utility.gp).toEqual(82);
      expect((projections[0] as SkaterProjection).stats.scoring.goals).toEqual(10);
    });
  });
});
