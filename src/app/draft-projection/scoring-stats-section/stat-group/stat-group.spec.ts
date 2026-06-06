import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { StatGroupComponent } from './stat-group';
import { ScoringStatKey } from '../../../models/stat-key.model';

describe('StatGroupComponent', () => {
  beforeEach(() => MockBuilder(StatGroupComponent));

  const getComponent = (
    activeStats: ScoringStatKey[] = ['goals', 'assists'],
    availableStats: ScoringStatKey[] = ['plusMinus'],
  ) =>
    MockRender(StatGroupComponent, { title: 'Skater Stats', activeStats, availableStats }).point
      .componentInstance;

  describe('template', () => {
    it('should render the group title', () => {
      getComponent();
      expect(ngMocks.find('h3').nativeElement.textContent.trim()).toEqual('Skater Stats');
    });

    it('should render a chip for each active stat', () => {
      getComponent(['goals', 'assists', 'plusMinus'], []);
      expect(ngMocks.findAll('.stat-chip').length).toEqual(3);
    });

    it('should render no chips when there are no active stats', () => {
      getComponent([], ['goals']);
      expect(ngMocks.findAll('.stat-chip').length).toEqual(0);
    });
  });

  describe('statRemoved output', () => {
    it('should emit statRemoved when a chip remove button is clicked', () => {
      const component = getComponent(['goals', 'assists'], []);
      const emitted: ScoringStatKey[] = [];
      component.statRemoved.subscribe((key) => emitted.push(key));
      ngMocks.findAll('.chip-remove')[0].nativeElement.click();
      expect(emitted).toEqual(['goals']);
    });
  });

  describe('statAdded output', () => {
    it('should emit statAdded when statSelected fires from the dropdown', () => {
      const component = getComponent(['goals'], ['assists']);
      const emitted: ScoringStatKey[] = [];
      component.statAdded.subscribe((key) => emitted.push(key));
      ngMocks
        .output(ngMocks.find('app-stat-add-dropdown'), 'statSelected')
        .emit('assists' as ScoringStatKey);
      expect(emitted).toEqual(['assists']);
    });
  });
});
