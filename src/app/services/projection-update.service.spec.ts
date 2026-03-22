import { MockBuilder, MockRender } from 'ng-mocks';
import { ProjectionUpdateService } from './projection-update.service';
import { PlayerProjection } from '../draft-projection/model';
import { ScoringStatKey } from '../models/player.model';
import { ScaleConfig } from '../draft-projection/projection-settings-section/model';

const makeScoring = (goals = 10, assists = 20): Record<ScoringStatKey, number> => ({
  goals,
  assists,
  plusMinus: 5,
  pim: 2,
  ppg: 3,
  ppa: 4,
  shg: 1,
  sha: 0,
  gwg: 2,
  sog: 100,
  shPct: 10,
  fw: 0,
  fl: 0,
  hits: 50,
  blocks: 30,
});

const makeProjection = (playerId: number, toiPerGame = 1200, gp = 82): PlayerProjection => ({
  playerId,
  stats: {
    scoring: makeScoring(),
    utility: { toiPerGame, gp },
  },
});

const scaleSettings: Record<'gp' | 'toiPerGame', ScaleConfig> = {
  toiPerGame: { scale: true, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
  gp: { scale: true, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
};

const noScaleSettings: Record<'gp' | 'toiPerGame', ScaleConfig> = {
  toiPerGame: { scale: false, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
  gp: { scale: false, scalableStats: new Set<ScoringStatKey>(['goals', 'assists', 'sog']) },
};

describe('ProjectionUpdateService', () => {
  beforeEach(() => MockBuilder(ProjectionUpdateService));

  const getService = () => MockRender(ProjectionUpdateService).point.componentInstance;

  describe('scaleScoring', () => {
    it('should scale only the stats in the scalable set', () => {
      const service = getService();
      const scoring = makeScoring(10, 20);
      const scalable = new Set<ScoringStatKey>(['goals', 'assists']);
      const result = service.scaleScoring(scoring, 2, scalable);
      expect(result.goals).toBe(20);
      expect(result.assists).toBe(40);
    });

    it('should leave stats outside the scalable set unchanged', () => {
      const service = getService();
      const scoring = makeScoring(10, 20);
      const scalable = new Set<ScoringStatKey>(['goals']);
      const result = service.scaleScoring(scoring, 2, scalable);
      expect(result.sog).toBe(100);
      expect(result.shPct).toBe(10);
    });

    it('should not mutate the original scoring object', () => {
      const service = getService();
      const scoring = makeScoring(10, 20);
      const original = { ...scoring };
      service.scaleScoring(scoring, 3, new Set<ScoringStatKey>(['goals']));
      expect(scoring).toEqual(original);
    });

    it('should scale all scalable stats by zero ratio, resulting in 0', () => {
      const service = getService();
      const scoring = makeScoring(10, 20);
      const result = service.scaleScoring(scoring, 0, new Set<ScoringStatKey>(['goals', 'assists']));
      expect(result.goals).toBe(0);
      expect(result.assists).toBe(0);
    });
  });

  describe('applyToiDelta', () => {
    it('should increment toiPerGame by the given delta', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 60, noScaleSettings);
      expect(result[0].stats.utility.toiPerGame).toBe(1260);
    });

    it('should decrement toiPerGame by the given delta', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, -60, noScaleSettings);
      expect(result[0].stats.utility.toiPerGame).toBe(1140);
    });

    it('should clamp toiPerGame to 0 when delta would make it negative', () => {
      const service = getService();
      const projections = [makeProjection(1, 30)];
      const result = service.applyToiDelta(projections, 1, -60, noScaleSettings);
      expect(result[0].stats.utility.toiPerGame).toBe(0);
    });

    it('should not affect projections for other players', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200), makeProjection(2, 900)];
      const result = service.applyToiDelta(projections, 1, 60, noScaleSettings);
      expect(result[1].stats.utility.toiPerGame).toBe(900);
    });

    it('should scale scoring stats when scale is enabled', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 600, scaleSettings);
      const ratio = 1800 / 1200;
      expect(result[0].stats.scoring.goals).toBeCloseTo(10 * ratio);
      expect(result[0].stats.scoring.assists).toBeCloseTo(20 * ratio);
    });

    it('should not scale stats outside the scalable set', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 600, scaleSettings);
      expect(result[0].stats.scoring.shPct).toBe(10);
    });

    it('should not scale when toiPerGame is 0', () => {
      const service = getService();
      const projections = [makeProjection(1, 0)];
      const result = service.applyToiDelta(projections, 1, 60, scaleSettings);
      expect(result[0].stats.scoring.goals).toBe(10);
    });

    it('should not scale when scale setting is disabled', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyToiDelta(projections, 1, 600, noScaleSettings);
      expect(result[0].stats.scoring.goals).toBe(10);
    });
  });

  describe('applyStatValue', () => {
    it('should update a scoring stat directly without scaling', () => {
      const service = getService();
      const projections = [makeProjection(1)];
      const result = service.applyStatValue(projections, 1, 'goals', 25, scaleSettings);
      expect(result[0].stats.scoring.goals).toBe(25);
      expect(result[0].stats.scoring.assists).toBe(20);
    });

    it('should update a utility stat and scale scoring when scale is enabled', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyStatValue(projections, 1, 'toiPerGame', 1800, scaleSettings);
      const ratio = 1800 / 1200;
      expect(result[0].stats.utility.toiPerGame).toBe(1800);
      expect(result[0].stats.scoring.goals).toBeCloseTo(10 * ratio);
      expect(result[0].stats.scoring.assists).toBeCloseTo(20 * ratio);
    });

    it('should update a utility stat without scaling when scale is disabled', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyStatValue(projections, 1, 'toiPerGame', 1800, noScaleSettings);
      expect(result[0].stats.utility.toiPerGame).toBe(1800);
      expect(result[0].stats.scoring.goals).toBe(10);
    });

    it('should not scale when the old utility value is 0', () => {
      const service = getService();
      const projections = [makeProjection(1, 0)];
      const result = service.applyStatValue(projections, 1, 'toiPerGame', 1200, scaleSettings);
      expect(result[0].stats.scoring.goals).toBe(10);
    });

    it('should not affect projections for other players', () => {
      const service = getService();
      const projections = [makeProjection(1), makeProjection(2)];
      const result = service.applyStatValue(projections, 1, 'goals', 99, scaleSettings);
      expect(result[1].stats.scoring.goals).toBe(10);
    });

    it('should not scale stats outside the scalable set when updating a utility stat', () => {
      const service = getService();
      const projections = [makeProjection(1, 1200)];
      const result = service.applyStatValue(projections, 1, 'toiPerGame', 2400, scaleSettings);
      expect(result[0].stats.scoring.shPct).toBe(10);
    });
  });
});
