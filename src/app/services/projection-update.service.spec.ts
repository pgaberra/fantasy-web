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
});
