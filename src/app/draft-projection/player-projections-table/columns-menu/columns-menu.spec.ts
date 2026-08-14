import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnsMenuComponent } from './columns-menu';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { ScoringStatKey, UtilityStatKey } from '../../../models/stat-key.model';

describe('ColumnsMenuComponent', () => {
  beforeEach(() => MockBuilder(ColumnsMenuComponent).keep(StatLabelPipe));

  const getComponent = (
    activeScoringColumns = new Set<ScoringStatKey>(['goals']),
    activeUtilityColumns = new Set<UtilityStatKey>(),
  ) =>
    MockRender(ColumnsMenuComponent, { activeScoringColumns, activeUtilityColumns }).point
      .componentInstance;

  const inputEvent = (value: string) => ({ target: { value } }) as unknown as Event;

  it('starts on the skater group and lists only skater scoring stats', () => {
    const component = getComponent();

    expect(component.group()).toEqual('skater');
    const keys = component.visibleOptions().map((option) => option.statKey);
    expect(keys).toContain('goals');
    expect(keys).not.toContain('sv');
  });

  it('marks an already active stat as ticked', () => {
    const component = getComponent(new Set<ScoringStatKey>(['goals']));

    const goals = component.visibleOptions().find((option) => option.statKey === 'goals')!;
    const assists = component.visibleOptions().find((option) => option.statKey === 'assists')!;
    expect(component.isActive(goals)).toEqual(true);
    expect(component.isActive(assists)).toEqual(false);
  });

  it('filters by the stat full name, not just its abbreviation', () => {
    const component = getComponent();

    component.onSearchInput(inputEvent('power play'));
    const keys = component.visibleOptions().map((option) => option.statKey);
    expect(keys).toEqual(['ppg', 'ppa', 'ppp']);
  });

  it('emits on the matching output for a scoring and a utility stat', () => {
    const component = getComponent();
    const scoringEmit = vi.spyOn(component.scoringToggled, 'emit');
    const utilityEmit = vi.spyOn(component.utilityToggled, 'emit');

    component.toggle({ statKey: 'assists', isUtility: false });
    expect(scoringEmit).toHaveBeenCalledWith('assists');

    component.toggle({ statKey: 'gp', isUtility: true });
    expect(utilityEmit).toHaveBeenCalledWith('gp');
  });

  it('clears the search when the group changes so the new group is not filtered by it', () => {
    const component = getComponent();
    component.onSearchInput(inputEvent('goals'));

    component.selectGroup('goalie');

    expect(component.searchTerm()).toEqual('');
    expect(component.visibleOptions().map((option) => option.statKey)).toContain('sv');
  });

  it('drops the utility group when the surface does not track utility stats', () => {
    const fixture = MockRender(ColumnsMenuComponent, {
      activeScoringColumns: new Set<ScoringStatKey>(),
      activeUtilityColumns: new Set<UtilityStatKey>(),
      showUtility: false,
    });

    expect(fixture.point.componentInstance.groups()).toEqual(['skater', 'goalie']);
    expect(ngMocks.findAll('.add-tab')).toHaveLength(2);
  });

  it('says nothing about decimals, which belong to the column they format', () => {
    getComponent();

    expect(ngMocks.findAll('#default-decimals-label')).toHaveLength(0);
    expect(ngMocks.findAll('app-toggle-switch')).toHaveLength(0);
  });
});
