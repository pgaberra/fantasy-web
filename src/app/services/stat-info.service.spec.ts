import { describe, expect, it } from 'vitest';
import { StatInfoService } from './stat-info.service';
import { SkaterUtilityStatKey } from '../models/stat-key.model';
import { Goalie, Player, Skater } from '../models/player.model';
import { SkaterPosition } from '../models/position.model';

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

  describe('isStatApplicable', () => {
    const skater = (positions: SkaterPosition[]): Player => ({
      id: 1,
      type: 'skater',
      name: 'Test Skater',
      positions: new Set(positions),
      stats: { utility: { gp: 0, toiPerGame: 0 } } as Skater['stats'],
    });
    const goalie: Player = {
      id: 2,
      type: 'goalie',
      name: 'Test Goalie',
      stats: { utility: { gp: 0 } } as Goalie['stats'],
    };

    it('gives a skater no save percentage — it is not zero, it does not exist', () => {
      expect(service.isStatApplicable('svPct', skater(['C']))).toEqual(false);
      expect(service.isStatApplicable('otl', skater(['C']))).toEqual(false);
    });

    it('gives a goalie none of the skater stats', () => {
      expect(service.isStatApplicable('goals', goalie)).toEqual(false);
      expect(service.isStatApplicable('hits', goalie)).toEqual(false);
    });

    it('keeps the stats both of them are scored on', () => {
      expect(service.isStatApplicable('gp', goalie)).toEqual(true);
      expect(service.isStatApplicable('toi', goalie)).toEqual(true);
      expect(service.isStatApplicable('toi', skater(['C']))).toEqual(true);
    });

    it('counts defencemen points only where the player is eligible at defence', () => {
      expect(service.isStatApplicable('defPoints', skater(['D']))).toEqual(true);
      expect(service.isStatApplicable('defPoints', skater(['LW', 'D']))).toEqual(true);
      expect(service.isStatApplicable('defPoints', skater(['C']))).toEqual(false);
      expect(service.isStatApplicable('defPoints', goalie)).toEqual(false);
    });
  });
});
