import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ProjectionsTableHeaderComponent } from './projections-table-header';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../../models/stat-key.model';
import { ActiveColumns, ScoringType } from '../../../models/projection.model';
import { DEFAULT_DECIMAL_SETTINGS, DecimalStatKey } from '../../projection-settings-section/model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';

describe('ProjectionsTableHeaderComponent', () => {
  const mockStatWeights: Record<ScoringStatKey, number> = {
    goals: 4.5,
    assists: 3,
    sog: 0.5,
    hits: 0.33,
    blocks: 0.5,
    gwg: 0.5,
    pim: 0.5,
    ppg: 0.5,
    ppa: 0.5,
    shg: 0.5,
    sha: 0.5,
    shPct: 0.5,
    fw: 0.5,
    fl: 0.5,
    plusMinus: 0.5,
    gs: 0,
    w: 0,
    l: 0,
    sho: 0,
    sa: 0,
    sv: 0,
    ga: 0,
    gaa: 0,
    svPct: 0,
  };

  const headerTemplate = `
    <table>
      <thead app-projections-table-header
        [activeColumns]="activeColumns"
        [scoringType]="scoringType"
        [(statWeights)]="statWeights"
        [useDefaultDecimals]="useDefaultDecimals"
        [(decimalSettings)]="decimalSettings"
      ></thead>
    </table>
  `;

  beforeEach(() => MockBuilder(ProjectionsTableHeaderComponent).keep(StatLabelPipe));

  const getFixture = (overrides: object = {}) =>
    MockRender(headerTemplate, {
      activeColumns: {
        scoring: new Set<ScoringStatKey>(['goals', 'assists']),
        utility: new Set<SkaterUtilityStatKey>(['gp']),
      } as ActiveColumns,
      scoringType: 'category' as ScoringType,
      statWeights: mockStatWeights,
      useDefaultDecimals: true,
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      maxDecimalSetting: 3,
      ...overrides,
    });

  const getComponent = (overrides: object = {}) =>
    ngMocks.find(getFixture(overrides).debugElement, ProjectionsTableHeaderComponent)
      .componentInstance;

  describe('summaryLabel', () => {
    it('should return "Fan Pts" when scoringType is "points"', () => {
      expect(getComponent({ scoringType: 'points' }).summaryLabel()).toEqual('Fan Pts');
    });

    it('should return "Z-Score" when scoringType is "category"', () => {
      expect(getComponent({ scoringType: 'category' }).summaryLabel()).toEqual('Z-Score');
    });
  });

  describe('gpDecimalSetting', () => {
    it('should return the gp value from decimalSettings', () => {
      expect(getComponent().gpDecimalSetting()).toEqual(DEFAULT_DECIMAL_SETTINGS.gp);
    });
  });

  describe('onDecimalInput', () => {
    it('should update decimalSettings when a decimal input changes', () => {
      const component = getComponent({
        decimalSettings: { gp: 0, goals: 0 } as Record<DecimalStatKey, number>,
      });
      const event = { target: { value: '2' } } as unknown as Event;
      component.onDecimalInput('gp', event);
      expect(component.decimalSettings().gp).toEqual(2);
    });

    it('should cap the decimal value to MAX_DECIMAL_SETTING', () => {
      const component = getComponent({
        decimalSettings: { gp: 0 } as Record<DecimalStatKey, number>,
      });
      const event = { target: { value: '5' } } as unknown as Event;
      component.onDecimalInput('gp', event);
      expect(component.decimalSettings().gp).toEqual(3);
    });
  });

  describe('template', () => {
    it('should render "#" and "Player" as fixed column headers', () => {
      getFixture();
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('#');
      expect(headers).toContain('Player');
    });

    it('should render a header for each active utility column', () => {
      getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('GP');
    });

    it('should render a header for each active scoring column', () => {
      getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('Goals');
      expect(headers).toContain('Assists');
    });

    it('should show "Z-Score" in the summary column when scoringType is "category"', () => {
      getFixture({ scoringType: 'category' });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('Z-Score');
    });

    it('should show "Fan Pts" in the summary column when scoringType is "points"', () => {
      getFixture({ scoringType: 'points' });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers.some((h) => h.includes('Fan Pts'))).toEqual(true);
    });

    it('should render the weight-row when scoringType is "points"', () => {
      getFixture({ scoringType: 'points' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(1);
    });

    it('should not render the weight-row when scoringType is "category"', () => {
      getFixture({ scoringType: 'category' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(0);
    });

    it('should populate weight inputs with the current stat weights', () => {
      getFixture({
        scoringType: 'points',
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const input = ngMocks.find('.weight-row input').nativeElement as HTMLInputElement;
      expect(input.value).toEqual('4.5');
    });

    it('should update statWeights when a weight input changes', () => {
      const fixture = getFixture({
        scoringType: 'points',
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const input = ngMocks.find('.weight-row input').nativeElement as HTMLInputElement;
      input.value = '5.5';
      input.dispatchEvent(new Event('input'));
      expect(component.statWeights().goals).toEqual(5.5);
    });

    it('should not render the decimal-row by default', () => {
      getFixture();
      expect(ngMocks.findAll('.decimal-row')).toHaveLength(0);
    });

    it('should render the decimal-row when useDefaultDecimals is false', () => {
      getFixture({ useDefaultDecimals: false });
      expect(ngMocks.findAll('.decimal-row')).toHaveLength(1);
    });

    it('should render one decimal input per active scoring column in the decimal-row', () => {
      getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(),
        } as ActiveColumns,
      });
      expect(ngMocks.findAll('.decimal-row input')).toHaveLength(2);
    });

    it('should update decimalSettings when a scoring decimal input changes', () => {
      const fixture = getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(),
        } as ActiveColumns,
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const input = ngMocks.find('.decimal-row input').nativeElement as HTMLInputElement;
      input.value = '2';
      input.dispatchEvent(new Event('input'));
      expect(component.decimalSettings().goals).toEqual(2);
    });

    it('should render a decimal input for the gp utility column in the decimal-row', () => {
      getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      expect(ngMocks.findAll('.decimal-row input')).toHaveLength(1);
    });

    it('should update decimalSettings when the gp decimal input changes', () => {
      const fixture = getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const input = ngMocks.find('.decimal-row input').nativeElement as HTMLInputElement;
      input.value = '1';
      input.dispatchEvent(new Event('input'));
      expect(component.decimalSettings().gp).toEqual(1);
    });
  });
});
