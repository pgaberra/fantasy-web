import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LeagueProjectionTableComponent } from './league-projection-table';
import { LeagueProjectionData } from '../league-projection';

describe('LeagueProjectionTableComponent', () => {
  const data: LeagueProjectionData = {
    categoryColumns: [
      { key: 'goals', label: 'Goals', tooltip: null, lowerIsBetter: false, decimals: 0 },
      {
        key: 'gaa',
        label: 'GAA',
        tooltip: 'Goals Against Average',
        lowerIsBetter: true,
        decimals: 2,
      },
    ],
    positionColumns: [
      { key: 'C', label: 'C', tooltip: 'Center', lowerIsBetter: false, decimals: 1 },
      { key: 'D', label: 'D', tooltip: 'Defense', lowerIsBetter: false, decimals: 1 },
    ],
    teams: [
      {
        teamId: 'a',
        name: 'Alpha',
        mine: true,
        total: 20,
        values: { goals: 60, gaa: 2.8, C: 10, D: 5 },
        positionBreakdown: {
          C: [
            { name: 'McDavid', value: 6 },
            { name: 'Point', value: 4 },
          ],
          D: [{ name: 'Makar', value: 5 }],
        },
      },
      {
        teamId: 'b',
        name: 'Bravo',
        mine: false,
        total: 30,
        values: { goals: 80, gaa: 2.4, C: 4, D: 12 },
        positionBreakdown: {
          C: [{ name: 'Crosby', value: 4 }],
          D: [{ name: 'Josi', value: 12 }],
        },
      },
    ],
  };

  function render() {
    return MockRender(LeagueProjectionTableComponent, {
      data,
      scoringType: 'category',
      scoreHeading: 'Z-Score',
    });
  }

  beforeEach(() => MockBuilder(LeagueProjectionTableComponent));

  it('defaults to category mode ranked by total descending', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;

    expect(component.mode()).toEqual('category');
    expect(component.sortedTeams().map((team) => team.teamId)).toEqual(['b', 'a']);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Goals');
    expect(text).toContain('Z-Score');
  });

  it('sorts by a category column and respects lower-is-better direction', () => {
    const component = render().point.componentInstance;

    component.sortBy('goals', false);
    expect(component.sortDir()).toEqual('desc');
    expect(component.sortedTeams().map((team) => team.teamId)).toEqual(['b', 'a']);

    component.sortBy('gaa', true);
    expect(component.sortDir()).toEqual('asc');
    expect(component.sortedTeams().map((team) => team.teamId)).toEqual(['b', 'a']);
  });

  it('toggles sort direction when the same column is clicked twice', () => {
    const component = render().point.componentInstance;

    component.sortBy('goals', false);
    component.sortBy('goals', false);

    expect(component.sortDir()).toEqual('asc');
    expect(component.sortedTeams().map((team) => team.teamId)).toEqual(['a', 'b']);
  });

  it('switches to the position breakdown', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;

    component.setMode('position');
    fixture.detectChanges();

    expect(component.columns().map((column) => column.key)).toEqual(['C', 'D']);
    expect(fixture.nativeElement.textContent as string).not.toContain('Goals');
  });

  it("reveals the selected team's roster grouped by position and toggles off", () => {
    const fixture = render();
    const component = fixture.point.componentInstance;

    expect(component.selectedTeam()).toBeNull();

    component.selectTeam('a');
    fixture.detectChanges();

    expect(component.selectedTeam()?.teamId).toEqual('a');
    const groups = component.breakdownGroups();
    expect(groups.map((group) => group.label)).toEqual(['C', 'D']);
    expect(groups[0].players.map((entry) => entry.name)).toEqual(['McDavid', 'Point']);
    expect(fixture.nativeElement.textContent as string).toContain('McDavid');

    component.selectTeam('a');
    expect(component.selectedTeam()).toBeNull();
  });
});
