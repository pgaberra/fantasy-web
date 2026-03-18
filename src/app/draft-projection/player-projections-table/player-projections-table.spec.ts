import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { vi } from 'vitest';
import { PlayerProjectionsTableComponent } from './player-projections-table';
import { Player, ScoringStatKey, UtilityStatKey } from '../../models/player.model';
import { PlayerProjection, ScoringType } from '../model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { FormatToiPipe } from '../../pipes/format-toi.pipe';

describe('PlayerProjectionsTableComponent', () => {
  const mockPlayers: Player[] = [
    {
      id: 1,
      name: 'Connor McDavid',
      positions: new Set(['C']),
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: { goals: 64, assists: 89, plusMinus: 33, pim: 36, ppg: 22, ppa: 38, shg: 1, sha: 0, gwg: 8, sog: 348, shPct: 18.4, fw: 812, fl: 623, hits: 42, blocks: 28 },
      },
    },
    {
      id: 2,
      name: 'Leon Draisaitl',
      positions: new Set(['C', 'LW']),
      stats: {
        utility: { gp: 80, toiPerGame: 1260 },
        scoring: { goals: 52, assists: 76, plusMinus: 18, pim: 58, ppg: 21, ppa: 34, shg: 1, sha: 2, gwg: 6, sog: 298, shPct: 17.4, fw: 367, fl: 298, hits: 51, blocks: 19 },
      },
    },
  ];

  const mockPlayerProjections: PlayerProjection[] = [
    { playerId: 1, stats: { scoring: mockPlayers[0].stats.scoring, utility: mockPlayers[0].stats.utility }, fantasyPoints: 1.5, zScore: 1 },
    { playerId: 2, stats: { scoring: mockPlayers[1].stats.scoring, utility: mockPlayers[1].stats.utility }, fantasyPoints: 0.8, zScore: -1 },
  ];

  const mockStatWeights: Record<ScoringStatKey, number> = {
    goals: 4.5, assists: 3, sog: 0.5, hits: 0.33, blocks: 0.5, gwg: 0.5, pim: 0.5, ppg: 0.5, ppa: 0.5, shg: 0.5, sha: 0.5, shPct: 0.5, fw: 0.5, fl: 0.5, plusMinus: 0.5,
  };

  beforeEach(() => MockBuilder(PlayerProjectionsTableComponent).keep(StatLabelPipe).keep(FormatToiPipe));

  const getComponent = (overrides: Partial<{
    players: Player[];
    scoringType: ScoringType;
    playerProjections: PlayerProjection[];
    statWeights: Record<ScoringStatKey, number>;
    activeScoringColumns: Set<ScoringStatKey>;
    activeUtilityColumns: Set<UtilityStatKey>;
  }> = {}) =>
    MockRender(PlayerProjectionsTableComponent, {
      players: mockPlayers,
      scoringType: 'category' as ScoringType,
      playerProjections: mockPlayerProjections,
      statWeights: mockStatWeights,
      activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      activeUtilityColumns: new Set<UtilityStatKey>(['gp']),
      ...overrides,
    }).point.componentInstance;

  describe('onStatInput', () => {
    it('should update a scoring stat with a numeric value', () => {
      const component = getComponent();
      const event = { target: { value: '70' } } as unknown as Event;
      component.onStatInput(1, 'goals', event);
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.scoring['goals']).toEqual(70);
    });

    it('should parse a plain number for non-toiPerGame utility stats', () => {
      const component = getComponent();
      const event = { target: { value: '42' } } as unknown as Event;
      component.onStatInput(1, 'gp', event);
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.utility['gp']).toEqual(42);
    });

    it('should parse mm:ss format for toiPerGame', () => {
      const component = getComponent();
      const event = { target: { value: '25:55' } } as unknown as Event;
      component.onStatInput(1, 'toiPerGame', event);
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.utility['toiPerGame']).toEqual(1555);
    });

    it('should not modify other players when updating a stat', () => {
      const component = getComponent();
      const before = component.playerProjections().find(p => p.playerId === 2)!.stats.scoring['goals'];
      component.onStatInput(1, 'goals', { target: { value: '99' } } as unknown as Event);
      expect(component.playerProjections().find(p => p.playerId === 2)!.stats.scoring['goals']).toEqual(before);
    });
  });

  describe('onToiKeydown', () => {
    it('should increment toiPerGame by 1 second on ArrowUp', () => {
      const component = getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['toiPerGame']) });
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      vi.spyOn(event, 'preventDefault');
      component.onToiKeydown(1, event);
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.utility['toiPerGame']).toEqual(1321);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should decrement toiPerGame by 1 second on ArrowDown', () => {
      const component = getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['toiPerGame']) });
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      vi.spyOn(event, 'preventDefault');
      component.onToiKeydown(1, event);
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.utility['toiPerGame']).toEqual(1319);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not go below 0 seconds on ArrowDown', () => {
      const component = getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['toiPerGame']) });
      // Set toiPerGame to 0 first
      component.onStatInput(1, 'toiPerGame', { target: { value: '0:00' } } as unknown as Event);
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      component.onToiKeydown(1, event);
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.utility['toiPerGame']).toEqual(0);
    });

    it('should not modify other players on ArrowUp', () => {
      const component = getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['toiPerGame']) });
      const before = component.playerProjections().find(p => p.playerId === 2)!.stats.utility['toiPerGame'];
      component.onToiKeydown(1, new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(component.playerProjections().find(p => p.playerId === 2)!.stats.utility['toiPerGame']).toEqual(before);
    });

    it('should ignore non-arrow keys', () => {
      const component = getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['toiPerGame']) });
      const before = component.playerProjections().find(p => p.playerId === 1)!.stats.utility['toiPerGame'];
      component.onToiKeydown(1, new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(component.playerProjections().find(p => p.playerId === 1)!.stats.utility['toiPerGame']).toEqual(before);
    });
  });

  describe('onWeightInput', () => {
    it('should update the weight for the specified stat', () => {
      const component = getComponent();
      component.onWeightInput('goals', { target: { value: '2.5' } } as unknown as Event);
      expect(component.statWeights()['goals']).toEqual(2.5);
    });

    it('should not modify other stat weights', () => {
      const component = getComponent();
      const assistsBefore = component.statWeights()['assists'];
      component.onWeightInput('goals', { target: { value: '10' } } as unknown as Event);
      expect(component.statWeights()['assists']).toEqual(assistsBefore);
    });
  });

  describe('template', () => {
    it('should render one row per player in the table body', () => {
      getComponent();
      expect(ngMocks.findAll('tbody tr')).toHaveLength(mockPlayers.length);
    });

    it('should render the player name in each body row', () => {
      getComponent();
      const rows = ngMocks.findAll('tbody tr');
      expect(rows[0].nativeElement.textContent).toContain('Connor McDavid');
      expect(rows[1].nativeElement.textContent).toContain('Leon Draisaitl');
    });

    it('should render a column header for each active scoring column', () => {
      getComponent();
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers).toContain('Goals');
      expect(headers).toContain('Assists');
    });

    it('should show utility column headers for active utility columns', () => {
      getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['gp']) });
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers).toContain('GP');
    });

    it('should hide utility columns when activeUtilityColumns is empty', () => {
      getComponent({ activeUtilityColumns: new Set<UtilityStatKey>() });
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers).not.toContain('GP');
    });

    it('should show the Fan Pts column header when scoringType is "points"', () => {
      getComponent({ scoringType: 'points' });
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers.some(h => h.includes('Fan Pts'))).toEqual(true);
    });

    it('should hide the Fan Pts column header when scoringType is "category"', () => {
      getComponent({ scoringType: 'category' });
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers.some(h => h.includes('Fan Pts'))).toEqual(false);
    });

    it('should render the weight input row when scoringType is "points"', () => {
      getComponent({ scoringType: 'points' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(1);
    });

    it('should not render the weight input row when scoringType is "category"', () => {
      getComponent({ scoringType: 'category' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(0);
    });

    it('should render the toiPerGame input as type="text" with mm:ss format', () => {
      getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['toiPerGame']) });
      const toiInput = ngMocks.find('.col-toiPerGame input').nativeElement as HTMLInputElement;
      expect(toiInput.type).toEqual('text');
      expect(toiInput.value).toEqual('22:00');
    });

    it('should render a non-toiPerGame utility input as type="number"', () => {
      getComponent({ activeUtilityColumns: new Set<UtilityStatKey>(['gp']) });
      const gpInput = ngMocks.find('.col-gp input').nativeElement as HTMLInputElement;
      expect(gpInput.type).toEqual('number');
    });
  });
});
