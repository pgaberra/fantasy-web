import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { PlayerProjectionsTableComponent } from './player-projections-table';
import { Player, ScoringStatKey, UtilityStatKey } from '../../models/player.model';
import { PlayerProjection, Projection } from '../model';
import { StatUpdateEvent, WeightUpdateEvent } from './model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';

describe('PlayerProjectionsTableComponent', () => {
  const mockPlayers: Player[] = [
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

  const mockPlayerProjections: PlayerProjection[] = [
    { playerId: 1, stats: { scoring: mockPlayers[0].stats.scoring, utility: mockPlayers[0].stats.utility }, fantasyPoints: 1.5 },
    { playerId: 2, stats: { scoring: mockPlayers[1].stats.scoring, utility: mockPlayers[1].stats.utility }, fantasyPoints: 0.8 },
  ];

  const mockProjection: Projection = {
    scoringType: 'category',
    playerProjections: mockPlayerProjections,
    statWeights: { goals: 4.5, assists: 3, sog: 0.5, hits: 0.33, blocks: 0.5, gwg: 0.5, pim: 0.5, ppg: 0.5, ppa: 0.5, shg: 0.5, sha: 0.5, shPct: 0.5, fw: 0.5, fl: 0.5, plusMinus: 0.5 },
  };

  beforeEach(() => MockBuilder(PlayerProjectionsTableComponent).keep(StatLabelPipe));

  const getComponent = (overrides: Partial<{
    players: Player[];
    projection: Projection;
    activeScoringColumns: Set<ScoringStatKey>;
    activeUtilityColumns: Set<UtilityStatKey>;
  }> = {}) =>
    MockRender(PlayerProjectionsTableComponent, {
      players: mockPlayers,
      projection: mockProjection,
      activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      activeUtilityColumns: new Set<UtilityStatKey>(['gp']),
      ...overrides,
    }).point.componentInstance;

  describe('onStatInput', () => {
    it('should emit statUpdated with the correct player, key, and numeric value', () => {
      const component = getComponent();
      const player = mockPlayers[0];
      const event = { target: { value: '70' } } as unknown as Event;
      const emitted: StatUpdateEvent[] = [];
      component.statUpdated.subscribe((e: StatUpdateEvent) => emitted.push(e));
      component.onStatInput(player.id, 'goals', event);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ playerId: player.id, key: 'goals', value: 70 });
    });

    it('should parse the input value as a number', () => {
      const component = getComponent();
      const player = mockPlayers[0];
      const event = { target: { value: '42.5' } } as unknown as Event;
      const emitted: StatUpdateEvent[] = [];
      component.statUpdated.subscribe((e: StatUpdateEvent) => emitted.push(e));
      component.onStatInput(player.id, 'gp', event);
      expect(emitted[0].value).toEqual(42.5);
    });
  });

  describe('onWeightInput', () => {
    it('should emit weightUpdated with the correct key and numeric value', () => {
      const component = getComponent();
      const event = { target: { value: '2.5' } } as unknown as Event;
      const emitted: WeightUpdateEvent[] = [];
      component.weightUpdated.subscribe((e: WeightUpdateEvent) => emitted.push(e));
      component.onWeightInput('goals', event);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ key: 'goals', value: 2.5 });
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
      getComponent({ projection: { ...mockProjection, scoringType: 'points' } });
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers.some(h => h.includes('Fan Pts'))).toEqual(true);
    });

    it('should hide the Fan Pts column header when scoringType is "category"', () => {
      getComponent({ projection: { ...mockProjection, scoringType: 'category' } });
      const headers = ngMocks.findAll('thead th').map(th => th.nativeElement.textContent.trim());
      expect(headers.some(h => h.includes('Fan Pts'))).toEqual(false);
    });

    it('should render the weight input row when scoringType is "points"', () => {
      getComponent({ projection: { ...mockProjection, scoringType: 'points' } });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(1);
    });

    it('should not render the weight input row when scoringType is "category"', () => {
      getComponent({ projection: { ...mockProjection, scoringType: 'category' } });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(0);
    });

    it('should emit statUpdated when a stat input fires an input event', () => {
      const component = getComponent();
      const emitted: StatUpdateEvent[] = [];
      component.statUpdated.subscribe((e: StatUpdateEvent) => emitted.push(e));
      const input = ngMocks.find('tbody .stat-input');
      (input.nativeElement as HTMLInputElement).value = '99';
      input.nativeElement.dispatchEvent(new Event('input'));
      expect(emitted).toHaveLength(1);
      expect(emitted[0].value).toEqual(99);
    });

    it('should emit weightUpdated when a weight input fires an input event', () => {
      const component = getComponent({ projection: { ...mockProjection, scoringType: 'points' } });
      const emitted: WeightUpdateEvent[] = [];
      component.weightUpdated.subscribe((e: WeightUpdateEvent) => emitted.push(e));
      const input = ngMocks.find('.weight-input');
      (input.nativeElement as HTMLInputElement).value = '5';
      input.nativeElement.dispatchEvent(new Event('input'));
      expect(emitted).toHaveLength(1);
      expect(emitted[0].value).toEqual(5);
    });
  });
});
