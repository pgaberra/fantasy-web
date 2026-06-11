import { MockBuilder, MockInstance, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { DraftProjectionComponent } from './draft-projection';
import { PlayerService } from '../services/player.service';
import { Goalie, Skater } from '../models/player.model';

describe('DraftProjectionComponent', () => {
  let mockPlayers: Skater[] = [];
  let mockGoalies: Goalie[] = [];

  beforeEach(() => {
    mockPlayers = [
      {
        id: 1,
        type: 'skater',
        name: 'Connor McDavid',
        positions: new Set(['C']),
        stats: {
          utility: { gp: 82, toiPerGame: 1320 },
          scoring: {
            goals: 64,
            assists: 89,
            points: 153,
            plusMinus: 33,
            pim: 36,
            ppg: 22,
            ppa: 38,
            ppp: 60,
            shg: 1,
            sha: 0,
            shp: 1,
            gwg: 8,
            sog: 348,
            shPct: 18.4,
            fw: 812,
            fl: 623,
            hits: 42,
            blocks: 28,
          },
        },
      },
      {
        id: 2,
        type: 'skater',
        name: 'Leon Draisaitl',
        positions: new Set(['C', 'LW']),
        stats: {
          utility: { gp: 80, toiPerGame: 1260 },
          scoring: {
            goals: 52,
            assists: 76,
            points: 128,
            plusMinus: 18,
            pim: 58,
            ppg: 21,
            ppa: 34,
            ppp: 55,
            shg: 1,
            sha: 2,
            shp: 3,
            gwg: 6,
            sog: 298,
            shPct: 17.4,
            fw: 367,
            fl: 298,
            hits: 51,
            blocks: 19,
          },
        },
      },
    ];

    mockGoalies = [
      {
        id: 101,
        type: 'goalie',
        name: 'Igor Shesterkin',
        stats: {
          utility: { gp: 58 },
          scoring: {
            gs: 58,
            w: 36,
            l: 17,
            sho: 3,
            sa: 1720,
            sv: 1565,
            ga: 155,
            gaa: 2.67,
            svPct: 0.91,
          },
        },
      },
    ];

    return MockBuilder(DraftProjectionComponent).mock(PlayerService, {
      getSkaters: () => of(mockPlayers),
      getGoalies: () => of(mockGoalies),
    });
  });

  const getComponent = () => MockRender(DraftProjectionComponent).point.componentInstance;

  describe('ngOnInit', () => {
    it('should load skaters and goalies from the service', () => {
      const component = getComponent();
      expect(component.players()).toEqual([...mockPlayers, ...mockGoalies]);
    });

    it('should call getPlayers and getGoalies on the PlayerService', () => {
      MockInstance(PlayerService, 'getSkaters', vi.fn().mockReturnValue(of(mockPlayers)));
      MockInstance(PlayerService, 'getGoalies', vi.fn().mockReturnValue(of(mockGoalies)));
      getComponent();
      expect(ngMocks.get(PlayerService).getSkaters).toHaveBeenCalledOnce();
      expect(ngMocks.get(PlayerService).getGoalies).toHaveBeenCalledOnce();
    });

    it('should initialize scoringType to "points"', () => {
      const component = getComponent();
      expect(component.scoringType()).toEqual('points');
    });
  });
});
