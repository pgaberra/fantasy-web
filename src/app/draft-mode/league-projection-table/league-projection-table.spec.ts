import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LeagueProjectionTableComponent } from './league-projection-table';
import { LeagueProjectionData } from '../league-projection';

describe('LeagueProjectionTableComponent', () => {
  const data: LeagueProjectionData = {
    categoryColumns: [
      { key: 'goals', label: 'Goals', tooltip: null, decimals: 2, rawDecimals: 0, weight: null },
      {
        key: 'gaa',
        label: 'GAA',
        tooltip: 'Goals Against Average',
        decimals: 2,
        rawDecimals: 2,
        weight: null,
      },
    ],
    positionColumns: [
      { key: 'C', label: 'C', tooltip: 'Center', decimals: 1, rawDecimals: 1, weight: null },
      { key: 'D', label: 'D', tooltip: 'Defense', decimals: 1, rawDecimals: 1, weight: null },
    ],
    teams: [
      {
        teamId: 'a',
        name: 'Alpha',
        mine: true,
        total: 20,
        values: { goals: 6, gaa: -2, C: 10, D: 5 },
        // Six players — one more than the collapsed cap, so the "show all" toggle appears.
        roster: [
          { name: 'McDavid', total: 9, values: { goals: 40, gaa: null } },
          { name: 'Point', total: 7, values: { goals: 30, gaa: null } },
          { name: 'Zacha', total: 5, values: { goals: 20, gaa: null } },
          { name: 'Nylander', total: 4, values: { goals: 10, gaa: null } },
          { name: 'Makar', total: 3, values: { goals: 8, gaa: null } },
          { name: 'Oettinger', total: 2, values: { goals: null, gaa: 2.4 } },
        ],
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
        roster: [
          { name: 'Crosby', total: 6, values: { goals: 35, gaa: null } },
          { name: 'Vasilevskiy', total: 4, values: { goals: null, gaa: 2.2 } },
        ],
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

  it('expands a category row into one row per player, capped until show-all is toggled', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;
    const alpha = data.teams[0];

    expect(component.isExpanded('a')).toBe(false);
    expect(component.showsRosterRows()).toBe(false);

    component.toggleExpand('a');
    fixture.detectChanges();

    expect(component.isExpanded('a')).toBe(true);
    expect(component.showsRosterRows()).toBe(true);
    expect(component.hasHiddenPlayers()).toBe(true);
    expect(component.expandedRosterSize()).toEqual(6);

    // Capped at the top five, each player listed exactly once — not repeated per category.
    expect(component.rosterRows(alpha).map((row) => row.name)).toEqual([
      'McDavid',
      'Point',
      'Zacha',
      'Nylander',
      'Makar',
    ]);
    const expandedText = fixture.nativeElement.textContent as string;
    expect(expandedText).toContain('McDavid');
    expect(expandedText).toContain('Show all 6 players');
    expect(expandedText).not.toContain('Oettinger');

    component.toggleShowAll();
    fixture.detectChanges();

    expect(component.rosterRows(alpha).map((row) => row.name)).toEqual([
      'McDavid',
      'Point',
      'Zacha',
      'Nylander',
      'Makar',
      'Oettinger',
    ]);
    expect(fixture.nativeElement.textContent as string).toContain('Oettinger');

    component.toggleExpand('a');
    expect(component.isExpanded('a')).toBe(false);
    expect(component.showAllPlayers()).toBe(false);
  });

  it('keeps the per-cell lists in the position breakdown, where a player owns one slot', () => {
    const component = render().point.componentInstance;
    const alpha = data.teams[0];

    component.setMode('position');
    component.toggleExpand('a');

    // No roster rows here — each player already appears exactly once, inside their slot column.
    expect(component.showsRosterRows()).toBe(false);
    expect(component.hasHiddenPlayers()).toBe(false);
    expect(
      component.cellPlayers(alpha, data.positionColumns[0]).map((entry) => entry.name),
    ).toEqual(['McDavid', 'Point']);
  });

  it('shows each stat weight under the column header in a points league, and never elsewhere', () => {
    const pointsData: LeagueProjectionData = {
      ...data,
      categoryColumns: [
        { key: 'goals', label: 'Goals', tooltip: null, decimals: 1, rawDecimals: 0, weight: 3 },
        {
          key: 'gaa',
          label: 'GAA',
          tooltip: 'Goals Against Average',
          decimals: 1,
          rawDecimals: 2,
          weight: -1,
        },
      ],
    };

    const pointsText = MockRender(LeagueProjectionTableComponent, {
      data: pointsData,
      scoringType: 'points',
      scoreHeading: 'Total Points',
    }).nativeElement.textContent as string;

    expect(pointsText).toContain('×3');
    expect(pointsText).toContain('×-1');

    // The shared fixture is a category league — the builder leaves its weights null, so no
    // multiplier should be rendered at all.
    expect(render().nativeElement.textContent as string).not.toContain('×');
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
