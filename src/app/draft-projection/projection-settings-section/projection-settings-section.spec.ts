import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ProjectionSettingsSectionComponent } from './projection-settings-section';
import { ScoringStatKey, UtilityStatKey } from '../../models/player.model';

describe('ProjectionSettingsSectionComponent', () => {
  beforeEach(() => MockBuilder(ProjectionSettingsSectionComponent));

  const defaultActiveScoringColumns = new Set<ScoringStatKey>(['goals', 'assists', 'sog', 'hits', 'blocks']);

  const getComponent = (
    activeUtilityColumns: Set<UtilityStatKey> = new Set(['gp', 'toiPerGame']),
    activeScoringColumns: Set<ScoringStatKey> = defaultActiveScoringColumns,
  ) =>
    MockRender(ProjectionSettingsSectionComponent, { activeUtilityColumns, activeScoringColumns }).point.componentInstance;

  describe('toggle', () => {
    it('should remove an active utility column when toggled', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggle('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(false);
    });

    it('should add an inactive utility column when toggled', () => {
      const component = getComponent(new Set<UtilityStatKey>(['toiPerGame']));
      component.toggle('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(true);
    });

    it('should return to the original state after two toggles', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggle('gp');
      component.toggle('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(true);
    });

    it('should only affect the targeted column', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggle('gp');
      expect(component.activeUtilityColumns().has('toiPerGame')).toEqual(true);
    });
  });

  describe('template', () => {
    it('should render a toggle for each utility stat key', () => {
      const component = getComponent();
      const toggles = ngMocks.findAll('.toggle-switch');
      // Each utility stat has a main toggle; each active utility stat also has a scale sub-toggle.
      // Per-stat toggles are hidden by default (advanced options collapsed).
      const expected = component.ALL_UTILITY_STAT_KEYS().size + component.activeUtilityColumns().size;
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
      const toggle = ngMocks.find('.toggle-switch');
      ngMocks.click(toggle);
      expect(component.activeUtilityColumns().size).not.toEqual(2);
    });
  });
});
