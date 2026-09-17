import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecimalsMenuComponent } from './decimals-menu';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { StatInfoService } from '../../../services/stat-info.service';
import { ScoringStatKey, UtilityStatKey } from '../../../models/stat-key.model';
import { DecimalStatKey, DEFAULT_DECIMAL_SETTINGS } from '../../projection-settings-section/model';

describe('DecimalsMenuComponent', () => {
  beforeEach(() => MockBuilder(DecimalsMenuComponent).keep(StatLabelPipe).keep(StatInfoService));

  const render = (
    scoringColumns: ScoringStatKey[] = ['goals', 'assists', 'svPct'],
    decimalSettings: Record<DecimalStatKey, number> = DEFAULT_DECIMAL_SETTINGS,
    usingDefaults = true,
  ) =>
    MockRender(DecimalsMenuComponent, {
      scoringColumns: new Set<ScoringStatKey>(scoringColumns),
      utilityColumns: new Set<UtilityStatKey>(['gp', 'toiPerGame']),
      decimalSettings,
      usingDefaults,
    });

  const getComponent = (...args: Parameters<typeof render>) =>
    render(...args).point.componentInstance;

  it('lists games played first, then the scoring stats in table order', () => {
    const component = getComponent(['svPct', 'assists', 'goals']);

    expect(component.columns()).toEqual(['gp', 'goals', 'assists', 'svPct']);
  });

  it('leaves out time on ice, which is written mm:ss whatever the setting', () => {
    const component = getComponent(['goals', 'toi']);

    expect(component.columns()).toEqual(['gp', 'goals']);
  });

  it('spells out an abbreviation and leaves a heading that is already the name alone', () => {
    const component = getComponent();

    expect(component.descriptionOf('svPct')).toEqual('Save Percentage');
    expect(component.descriptionOf('goals')).toEqual(null);
  });

  it('sets every counting stat at once and leaves the rate stats where they were', () => {
    const component = getComponent();
    const emit = vi.spyOn(component.decimalSettingsChange, 'emit');

    component.setCountingDecimals(1);

    expect(emit).toHaveBeenCalledWith({
      ...DEFAULT_DECIMAL_SETTINGS,
      gp: 1,
      goals: 1,
      assists: 1,
    });
  });

  it('does not touch a counting stat the projection does not carry', () => {
    const component = getComponent(['goals']);
    const emit = vi.spyOn(component.decimalSettingsChange, 'emit');

    component.setCountingDecimals(2);

    expect(emit).toHaveBeenCalledWith({ ...DEFAULT_DECIMAL_SETTINGS, gp: 2, goals: 2 });
  });

  it('sets a single stat without moving the others', () => {
    const component = getComponent();
    const emit = vi.spyOn(component.decimalSettingsChange, 'emit');

    component.setDecimals('svPct', 2);

    expect(emit).toHaveBeenCalledWith({ ...DEFAULT_DECIMAL_SETTINGS, svPct: 2 });
  });

  it('shows what the counting stats share, and nothing when they differ', () => {
    expect(getComponent().sharedCountingDecimals()).toEqual(0);

    const mixed = getComponent(undefined, { ...DEFAULT_DECIMAL_SETTINGS, goals: 1 });
    expect(mixed.sharedCountingDecimals()).toEqual(null);
  });

  it('presses no button in the shared row while the counting stats differ', () => {
    render(undefined, { ...DEFAULT_DECIMAL_SETTINGS, goals: 1 });

    const pressed = ngMocks
      .findAll('.decimals-row--bulk button')
      .filter((button) => button.attributes['aria-pressed'] === 'true');
    expect(pressed).toEqual([]);
  });

  it('names the shared row for counting stats only while a rate stat is in the table', () => {
    expect(getComponent().bulkLabel()).toEqual('All counting stats');
    expect(getComponent(['goals', 'assists']).bulkLabel()).toEqual('All stats');
  });

  it('drops the shared row when there is a single counting stat to set', () => {
    const fixture = MockRender(DecimalsMenuComponent, {
      scoringColumns: new Set<ScoringStatKey>(['goals', 'svPct']),
      utilityColumns: new Set<UtilityStatKey>(),
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      usingDefaults: true,
    });

    expect(fixture.point.componentInstance.showBulkRow()).toEqual(false);
    expect(ngMocks.findAll('.decimals-row--bulk')).toEqual([]);
  });

  it('offers the reset only once something has been set by hand', () => {
    render();
    expect(ngMocks.find('.decimals-reset').nativeElement.disabled).toEqual(true);

    render(undefined, DEFAULT_DECIMAL_SETTINGS, false);
    const reset = ngMocks.findAll('.decimals-reset').at(-1)!;
    expect(reset.nativeElement.disabled).toEqual(false);
  });

  it('emits the reset', () => {
    const fixture = render(undefined, DEFAULT_DECIMAL_SETTINGS, false);
    const emit = vi.spyOn(fixture.point.componentInstance.resetToDefaults, 'emit');

    ngMocks.click('.decimals-reset');

    expect(emit).toHaveBeenCalled();
  });
});
