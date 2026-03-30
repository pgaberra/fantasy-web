import { describe, expect, it } from 'vitest';
import { StatInfoService } from './stat-info.service';
import { SkaterUtilityStatKey } from '../models/stat-key.model';

describe('StatInfoService', () => {
  const service = new StatInfoService();

  describe('isGoalieScoringStat', () => {
    it('should return true for goalie scoring stats', () => {
      expect(service.isGoalieScoringStat('w')).toEqual(true);
      expect(service.isGoalieScoringStat('svPct')).toEqual(true);
    });

    it('should return false for skater scoring stats', () => {
      expect(service.isGoalieScoringStat('goals')).toEqual(false);
      expect(service.isGoalieScoringStat('assists')).toEqual(false);
    });
  });

  describe('isSkaterScoringStat', () => {
    it('should return true for skater scoring stats', () => {
      expect(service.isSkaterScoringStat('goals')).toEqual(true);
      expect(service.isSkaterScoringStat('hits')).toEqual(true);
    });

    it('should return false for goalie scoring stats', () => {
      expect(service.isSkaterScoringStat('w')).toEqual(false);
      expect(service.isSkaterScoringStat('svPct')).toEqual(false);
    });
  });

  describe('isGoalieUtilityStat', () => {
    it('should return true for goalie utility stats', () => {
      expect(service.isGoalieUtilityStat('gp')).toEqual(true);
    });

    it('should return false for skater-only utility stats', () => {
      const skaterOnlyKey: SkaterUtilityStatKey = 'toiPerGame';
      expect(service.isGoalieUtilityStat(skaterOnlyKey)).toEqual(false);
    });
  });

  describe('isSkaterUtilityStat', () => {
    it('should return true for skater utility stats', () => {
      expect(service.isSkaterUtilityStat('gp')).toEqual(true);
      expect(service.isSkaterUtilityStat('toiPerGame')).toEqual(true);
    });
  });
});
