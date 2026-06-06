import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { StatAddDropdownComponent } from './stat-add-dropdown';
import { ScoringStatKey } from '../../../models/stat-key.model';

describe('StatAddDropdownComponent', () => {
  beforeEach(() => MockBuilder(StatAddDropdownComponent));

  const getComponent = (availableStats: ScoringStatKey[] = ['goals', 'assists']) =>
    MockRender(StatAddDropdownComponent, { availableStats }).point.componentInstance;

  describe('add-stat button', () => {
    it('should be enabled when there are available stats', () => {
      getComponent(['goals']);
      const btn = ngMocks.find<HTMLButtonElement>('.add-stat-btn').nativeElement;
      expect(btn.disabled).toEqual(false);
    });

    it('should be disabled when there are no available stats', () => {
      getComponent([]);
      const btn = ngMocks.find<HTMLButtonElement>('.add-stat-btn').nativeElement;
      expect(btn.disabled).toEqual(true);
    });

    it('should open the dropdown when clicked', () => {
      const component = getComponent(['goals']);
      ngMocks.find('.add-stat-btn').nativeElement.click();
      expect(component.dropdownOpen()).toEqual(true);
    });

    it('should toggle the dropdown closed when clicked again', () => {
      const component = getComponent(['goals']);
      component.dropdownOpen.set(true);
      ngMocks.find('.add-stat-btn').nativeElement.click();
      expect(component.dropdownOpen()).toEqual(false);
    });
  });

  describe('dropdown', () => {
    it('should not render dropdown items when closed', () => {
      getComponent(['goals', 'assists']);
      expect(ngMocks.findAll('.dropdown-item').length).toEqual(0);
    });

    it('should render a dropdown item for each available stat when open', () => {
      const fixture = MockRender(StatAddDropdownComponent, {
        availableStats: ['goals', 'assists'] as ScoringStatKey[],
      });
      fixture.point.componentInstance.dropdownOpen.set(true);
      fixture.detectChanges();
      expect(ngMocks.findAll('.dropdown-item').length).toEqual(2);
    });
  });

  describe('selectStat', () => {
    it('should emit statSelected with the chosen key', () => {
      const component = getComponent(['goals', 'assists']);
      const emitted: ScoringStatKey[] = [];
      component.statSelected.subscribe((key) => emitted.push(key));
      component.selectStat('goals');
      expect(emitted).toEqual(['goals']);
    });

    it('should close the dropdown after selecting a stat', () => {
      const component = getComponent(['goals']);
      component.dropdownOpen.set(true);
      component.selectStat('goals');
      expect(component.dropdownOpen()).toEqual(false);
    });
  });
});
