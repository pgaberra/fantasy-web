import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ScoringStatsSectionComponent } from './scoring-stats-section';
import { StatGroupComponent } from './stat-group/stat-group';
import { ScoringStatKey } from '../../models/stat-key.model';

describe('ScoringStatsSectionComponent', () => {
  beforeEach(() => MockBuilder(ScoringStatsSectionComponent));

  const getComponent = (activeScoringColumns: Set<ScoringStatKey> = new Set(['goals', 'assists'])) =>
    MockRender(ScoringStatsSectionComponent, { activeScoringColumns }).point.componentInstance;

  describe('toggle', () => {
    it('should remove an active column when toggled', () => {
      const component = getComponent(new Set(['goals', 'assists']));
      component.toggle('goals');
      expect(component.activeScoringColumns().has('goals')).toEqual(false);
    });

    it('should add an inactive column when toggled', () => {
      const component = getComponent(new Set(['goals']));
      component.toggle('assists');
      expect(component.activeScoringColumns().has('assists')).toEqual(true);
    });

    it('should only affect the targeted column', () => {
      const component = getComponent(new Set(['goals', 'assists']));
      component.toggle('goals');
      expect(component.activeScoringColumns().has('assists')).toEqual(true);
    });

    it('should toggle back to original state on second call', () => {
      const component = getComponent(new Set(['goals', 'assists']));
      component.toggle('goals');
      component.toggle('goals');
      expect(component.activeScoringColumns().has('goals')).toEqual(true);
    });
  });

  describe('template', () => {
    it('should render two stat-group components', () => {
      getComponent();
      expect(ngMocks.findAll(StatGroupComponent).length).toEqual(2);
    });

    it('should pass skater active stats to the first stat-group', () => {
      getComponent(new Set<ScoringStatKey>(['goals', 'assists', 'w']));
      const skaterGroup = ngMocks.findAll(StatGroupComponent)[0];
      expect(ngMocks.input(skaterGroup, 'activeStats')).toEqual(['goals', 'assists']);
    });

    it('should pass goalie active stats to the second stat-group', () => {
      getComponent(new Set<ScoringStatKey>(['goals', 'w']));
      const goalieGroup = ngMocks.findAll(StatGroupComponent)[1];
      expect(ngMocks.input(goalieGroup, 'activeStats')).toEqual(['w']);
    });

    it('should call toggle when statRemoved fires from a stat-group', () => {
      const component = getComponent(new Set<ScoringStatKey>(['goals', 'assists']));
      const skaterGroup = ngMocks.findAll(StatGroupComponent)[0];
      ngMocks.output(skaterGroup, 'statRemoved').emit('goals' as ScoringStatKey);
      expect(component.activeScoringColumns().has('goals')).toEqual(false);
    });

    it('should call toggle when statAdded fires from a stat-group', () => {
      const component = getComponent(new Set<ScoringStatKey>(['goals']));
      const skaterGroup = ngMocks.findAll(StatGroupComponent)[0];
      ngMocks.output(skaterGroup, 'statAdded').emit('assists' as ScoringStatKey);
      expect(component.activeScoringColumns().has('assists')).toEqual(true);
    });
  });
});
