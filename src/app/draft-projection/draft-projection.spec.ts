import { MockBuilder, MockInstance, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { DraftProjectionComponent } from './draft-projection';
import { PlayerService } from '../services/player.service';
import { Player } from '../models/player.model';

describe('DraftProjectionComponent', () => {
  let mockPlayers: Player[] = [];

  beforeEach(() => {
    mockPlayers = [
      {
        id: 1,
        name: 'Connor McDavid',
        positions: new Set(['C']),
        stats: {
          utility: { gp: 82, toiPerGame: 21.5 },
          scoring: { goals: 64, assists: 89, plusMinus: 33, pim: 36, ppg: 22, ppa: 38, shg: 1, sha: 0, gwg: 8, sog: 348, shPct: 18.4, fw: 812, fl: 623, hits: 42, blocks: 28 },
        },
      },
      {
        id: 2,
        name: 'Leon Draisaitl',
        positions: new Set(['C', 'LW']),
        stats: {
          utility: { gp: 80, toiPerGame: 20.1 },
          scoring: { goals: 52, assists: 76, plusMinus: 18, pim: 58, ppg: 21, ppa: 34, shg: 1, sha: 2, gwg: 6, sog: 298, shPct: 17.4, fw: 367, fl: 298, hits: 51, blocks: 19 },
        },
      },
    ];

    return MockBuilder(DraftProjectionComponent).mock(PlayerService, {
      getPlayers: () => of(mockPlayers),
    });
  });

  const getComponent = () => MockRender(DraftProjectionComponent).point.componentInstance;

  describe('ngOnInit', () => {
    it('should load players from the service', () => {
      const component = getComponent();
      expect(component.players()).toEqual(mockPlayers);
    });

    it('should call getPlayers on the PlayerService', () => {
      MockInstance(PlayerService, 'getPlayers', vi.fn().mockReturnValue(of(mockPlayers)));
      getComponent();
      expect(ngMocks.get(PlayerService).getPlayers).toHaveBeenCalledOnce();
    });

    it('should initialize a projection with one entry per player', () => {
      const component = getComponent();
      expect(component.projection()!.playerProjections.length).toEqual(mockPlayers.length);
    });

    it('should initialize projection with scoring type "points"', () => {
      const component = getComponent();
      expect(component.projection()!.scoringType).toEqual('points');
    });
  });

  describe('onScoringTypeChange', () => {
    it('should update the projection scoringType', () => {
      const component = getComponent();
      component.onScoringTypeChange('category');
      expect(component.projection()!.scoringType).toEqual('category');
    });

    it('should switch back from "category" to "points"', () => {
      const component = getComponent();
      component.onScoringTypeChange('category');
      component.onScoringTypeChange('points');
      expect(component.projection()!.scoringType).toEqual('points');
    });
  });

  describe('onStatUpdated', () => {
    it('should update the specified scoring stat for the correct player', () => {
      const component = getComponent();
      component.onStatUpdated({ playerId: 1, key: 'goals', value: 99 });
      const pp = component.projection()!.playerProjections.find(p => p.playerId === 1)!;
      expect(pp.stats.scoring['goals']).toEqual(99);
    });

    it('should update the specified utility stat for the correct player', () => {
      const component = getComponent();
      component.onStatUpdated({ playerId: 1, key: 'gp', value: 70 });
      const pp = component.projection()!.playerProjections.find(p => p.playerId === 1)!;
      expect(pp.stats.utility['gp']).toEqual(70);
    });

    it('should not modify other players when updating a stat', () => {
      const component = getComponent();
      const before = component.projection()!.playerProjections.find(p => p.playerId === 2)!.stats.scoring['goals'];
      component.onStatUpdated({ playerId: 1, key: 'goals', value: 99 });
      expect(component.projection()!.playerProjections.find(p => p.playerId === 2)!.stats.scoring['goals']).toEqual(before);
    });
  });

  describe('onWeightUpdated', () => {
    it('should update the weight for the specified stat', () => {
      const component = getComponent();
      component.onWeightUpdated({ key: 'goals', value: 10 });
      expect(component.projection()!.statWeights['goals']).toEqual(10);
    });

    it('should not modify other stat weights', () => {
      const component = getComponent();
      const assistsBefore = component.projection()!.statWeights['assists'];
      component.onWeightUpdated({ key: 'goals', value: 10 });
      expect(component.projection()!.statWeights['assists']).toEqual(assistsBefore);
    });
  });
});
