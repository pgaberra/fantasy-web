import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ScoringTypeSectionComponent } from './scoring-type-section';

describe('ScoringTypeSectionComponent', () => {
  beforeEach(() => MockBuilder(ScoringTypeSectionComponent));

  const getComponent = (scoringType: 'points' | 'category' = 'category') =>
    MockRender(ScoringTypeSectionComponent, { scoringType }).point.componentInstance;

  describe('select', () => {
    it('should update scoringType to "points"', () => {
      const component = getComponent('category');
      component.select('points');
      expect(component.scoringType()).toEqual('points');
    });

    it('should update scoringType to "category"', () => {
      const component = getComponent('points');
      component.select('category');
      expect(component.scoringType()).toEqual('category');
    });

    it('should keep the same value when selecting the current type', () => {
      const component = getComponent('points');
      component.select('points');
      expect(component.scoringType()).toEqual('points');
    });
  });

  describe('template', () => {
    it('should mark the "Points League" button as active when scoringType is "points"', () => {
      const fixture = MockRender(ScoringTypeSectionComponent, { scoringType: 'points' });
      const buttons = ngMocks.findAll(fixture, 'button');
      expect(buttons[0].classes['active']).toEqual(true);
      expect(buttons[1].classes['active']).toBeFalsy();
    });

    it('should mark the "Category League" button as active when scoringType is "category"', () => {
      const fixture = MockRender(ScoringTypeSectionComponent, { scoringType: 'category' });
      const buttons = ngMocks.findAll(fixture, 'button');
      expect(buttons[0].classes['active']).toBeFalsy();
      expect(buttons[1].classes['active']).toEqual(true);
    });

    it('should call select("points") when the "Points League" button is clicked', () => {
      const component = getComponent('category');
      const buttons = ngMocks.findAll('button');
      ngMocks.click(buttons[0]);
      expect(component.scoringType()).toEqual('points');
    });

    it('should call select("category") when the "Category League" button is clicked', () => {
      const component = getComponent('points');
      const buttons = ngMocks.findAll('button');
      ngMocks.click(buttons[1]);
      expect(component.scoringType()).toEqual('category');
    });
  });
});
