import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LeagueProjectionTableComponent } from './league-projection-table';
import { LeagueProjectionData } from '../league-projection';

describe('LeagueProjectionTableComponent', () => {
  const data: LeagueProjectionData = {
    categoryColumns: [
      { key: 'goals', label: 'Goals', tooltip: null, decimals: 2, rawDecimals: 0 },
      { key: 'gaa', label: 'GAA', tooltip: 'Goals Against Average', decimals: 2, rawDecimals: 2 },
    ],
    positionColumns: [
      { key: 'C', label: 'C', tooltip: 'Center', decimals: 1, rawDecimals: 1 },
      { key: 'D', label: 'D', tooltip: 'Defense', decimals: 1, rawDecimals: 1 },
    ],
    teams: [
      {
        teamId: 'a',
        name: 'Alpha',
        mine: true,
        total: 20,
        values: { goals: 6, gaa: -2, C: 10, D: 5 },
        categoryContributors: {
          goals: [
            { name: 'McDavid', value: 40 },
            { name: 'Point', value: 30 },
            { name: 'Zacha', value: 20 },
            { name: 'Nylander', value: 10 },
          ],
          gaa: [{ name: 'Oettinger', value: 2.4 }],
        },
        positionPlayers: {
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
        values: { goals: 8, gaa: -1, C: 4, D: 12 },
        categoryContributors: {
          goals: [{ name: 'Crosby', value: 35 }],
          gaa: [{ name: 'Vasilevskiy', value: 2.2 }],
        },
        positionPlayers: {
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

  it('sorts by a category column, defaulting to descending and toggling on repeat', () => {
    const component = render().point.componentInstance;

    component.sortBy('goals');
    expect(component.sortDir()).toEqual('desc');
    expect(component.sortedTeams().map((team) => team.teamId)).toEqual(['b', 'a']);

    component.sortBy('goals');
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

  it('expands a row, caps category cells at the top contributors, then reveals all', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;
    const alpha = data.teams[0];
    const goalsColumn = data.categoryColumns[0];

    expect(component.isExpanded('a')).toBe(false);

    component.toggleExpand('a');
    fixture.detectChanges();

    expect(component.isExpanded('a')).toBe(true);
    expect(component.hasHiddenContributors()).toBe(true);
    expect(component.cellPlayers(alpha, goalsColumn).map((entry) => entry.name)).toEqual([
      'McDavid',
      'Point',
      'Zacha',
    ]);
    expect(fixture.nativeElement.textContent as string).toContain('McDavid');

    component.toggleShowAll();
    expect(component.cellPlayers(alpha, goalsColumn).map((entry) => entry.name)).toEqual([
      'McDavid',
      'Point',
      'Zacha',
      'Nylander',
    ]);

    component.toggleExpand('a');
    expect(component.isExpanded('a')).toBe(false);
    expect(component.showAllPlayers()).toBe(false);
  });

  it('lists the players assigned to each position slot when expanded', () => {
    const component = render().point.componentInstance;
    const alpha = data.teams[0];

    component.setMode('position');
    component.toggleExpand('a');

    expect(
      component.cellPlayers(alpha, data.positionColumns[0]).map((entry) => entry.name),
    ).toEqual(['McDavid', 'Point']);
    expect(component.hasHiddenContributors()).toBe(false);
  });

  it('shades cells on a diverging green-red scale, including the total column', () => {
    const component = render().point.componentInstance;

    // Column leader trends green, laggard red (goals: a=6 is the min, b=8 the max).
    expect(component.shade('goals', 8)).toContain('rgba(22, 163, 74');
    expect(component.shade('goals', 6)).toContain('rgba(233, 69, 96');

    // The total column now carries the same heat (a.total=20 min, b.total=30 max).
    expect(component.shade('total', 30)).toContain('rgba(22, 163, 74');
    expect(component.shade('total', 20)).toContain('rgba(233, 69, 96');

    // Missing values stay clear.
    expect(component.shade('goals', null)).toEqual('transparent');
  });
});
