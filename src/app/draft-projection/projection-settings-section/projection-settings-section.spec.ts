import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ProjectionSettingsSectionComponent } from './projection-settings-section';
import { ScoringStatKey, UTILITY_STAT_KEYS, UtilityStatKey } from '../../models/player.model';
import { DEFAULT_SCALE_SETTINGS } from './model';
import { ToggleSwitchComponent } from './toggle-switch/toggle-switch';
import { SettingRowComponent } from './setting-row/setting-row';

describe('ProjectionSettingsSectionComponent', () => {
  beforeEach(() =>
    MockBuilder(ProjectionSettingsSectionComponent)
      .keep(ToggleSwitchComponent)
      .keep(SettingRowComponent),
  );

  const defaultActiveScoringColumns = new Set<ScoringStatKey>(['goals', 'assists', 'sog', 'hits', 'blocks']);

  const getComponent = (
    activeUtilityColumns: Set<UtilityStatKey> = new Set(['gp', 'toiPerGame']),
    activeScoringColumns: Set<ScoringStatKey> = defaultActiveScoringColumns,
  ) =>
    MockRender(ProjectionSettingsSectionComponent, {
      activeUtilityColumns,
      activeScoringColumns,
      scaleSettings: DEFAULT_SCALE_SETTINGS,
    }).point.componentInstance;

  describe('toggle', () => {
    it('should remove an active utility column when toggled', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(false);
    });

    it('should add an inactive utility column when toggled', () => {
      const component = getComponent(new Set<UtilityStatKey>(['toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(true);
    });

    it('should return to the original state after two toggles', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(true);
    });

    it('should only affect the targeted column', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('toiPerGame')).toEqual(true);
    });
  });

  describe('template', () => {
    it('should render a toggle for each utility stat key', () => {
      const component = getComponent();
      const toggles = ngMocks.findAll('.toggle-switch');
      // Each utility stat has a main toggle; each active utility stat also has a scale sub-toggle.
      // There is also one toggle for the "Show decimals row" setting.
      // Per-stat toggles are hidden by default (advanced options collapsed).
      const expected = UTILITY_STAT_KEYS.length + component.activeUtilityColumns().size + 1;
      expect(toggles.length).toEqual(expected);
    });

    it('should apply the "on" class to active utility column toggles', () => {
      getComponent(new Set<UtilityStatKey>(['gp']));
      const toggles = ngMocks.findAll('.toggle-switch');
      const onToggles = toggles.filter(t => t.classes['on']);
      // gp main toggle is "on" + gp scale sub-toggle is "on" (defaults to true); advanced panel collapsed
      expect(onToggles.length).toEqual(2);
    });

    it('should not apply the "on" class when no utility columns are active', () => {
      getComponent(new Set<UtilityStatKey>());
      const toggles = ngMocks.findAll('.toggle-switch');
      expect(toggles.every(t => !t.classes['on'])).toEqual(true);
    });

    it('should call toggle() when a toggle switch is clicked', () => {
      const component = getComponent(new Set<UtilityStatKey>(['gp', 'toiPerGame']));
      const toggles = ngMocks.findAll('.toggle-switch');
      const firstUtilityToggle = toggles[1]; // index 0 is the "Show decimals row" toggle
      ngMocks.click(firstUtilityToggle);
      expect(component.activeUtilityColumns().size).not.toEqual(2);
    });
  });
});
