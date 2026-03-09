import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { LeagueStatsSectionComponent } from './league-stats-section';
import { ScoringStatKey } from '../../models/player.model';

describe('LeagueStatsSectionComponent', () => {
  beforeEach(() => MockBuilder(LeagueStatsSectionComponent));

  const getComponent = (activeScoringColumns: Set<ScoringStatKey> = new Set(['goals', 'assists'])) =>
    MockRender(LeagueStatsSectionComponent, { activeScoringColumns }).point.componentInstance;

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
    it('should render a checkbox for each scoring stat key', () => {
      const component = getComponent();
      const checkboxes = ngMocks.findAll('input[type="checkbox"]');
      expect(checkboxes.length).toEqual(component.ALL_SCORING_STAT_KEYS().size);
    });

    it('should check the checkbox for active columns', () => {
      getComponent(new Set<ScoringStatKey>(['goals', 'assists']));
      const checkboxes = ngMocks.findAll<HTMLInputElement>('input[type="checkbox"]');
      const checked = checkboxes.filter(cb => cb.nativeElement.checked).length;
      expect(checked).toEqual(2);
    });

    it('should toggle a column when its checkbox changes', () => {
      const component = getComponent(new Set<ScoringStatKey>(['goals', 'assists']));
      const checkboxes = ngMocks.findAll('input[type="checkbox"]');
      checkboxes[0].nativeElement.dispatchEvent(new Event('change'));
      expect(component.activeScoringColumns().size).not.toEqual(2);
    });
  });
});
