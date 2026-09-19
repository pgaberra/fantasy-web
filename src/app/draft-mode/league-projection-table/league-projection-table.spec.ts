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
        // Six players — one more than the collapsed cap, so the "show all" toggle appears. Zacha
        // leads on goals despite a middling total, so sorting by Goals must reorder the rows.
        roster: [
          {
            name: 'McDavid',
            total: 9,
            values: { goals: 40, gaa: null },
            contributions: { goals: 40, gaa: null },
          },
          {
            name: 'Point',
            total: 7,
            values: { goals: 30, gaa: null },
            contributions: { goals: 30, gaa: null },
          },
          {
            name: 'Zacha',
            total: 5,
            values: { goals: 55, gaa: null },
            contributions: { goals: 55, gaa: null },
          },
          {
            name: 'Nylander',
            total: 4,
            values: { goals: 10, gaa: null },
            contributions: { goals: 10, gaa: null },
          },
          {
            name: 'Makar',
            total: 3,
            values: { goals: 8, gaa: null },
            contributions: { goals: 8, gaa: null },
          },
          {
            name: 'Oettinger',
            total: 2,
            values: { goals: null, gaa: 2.4 },
            contributions: { goals: null, gaa: -1 },
          },
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
          {
            name: 'Crosby',
            total: 6,
            values: { goals: 35, gaa: null },
            contributions: { goals: 35, gaa: null },
          },
          {
            name: 'Vasilevskiy',
            total: 4,
            values: { goals: null, gaa: 2.2 },
            contributions: { goals: null, gaa: -1.5 },
          },
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
    expect(component.showsRosterRows()).toBe(true);

    component.toggleExpand('a');
    fixture.detectChanges();

    expect(component.isExpanded('a')).toBe(true);
    expect(component.hasHiddenPlayers(alpha)).toBe(true);

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

    component.toggleShowAll('a');
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
    expect(component.isShowingAll('a')).toBe(false);
  });

  it("orders each team's player rows by the column the table is sorted on", () => {
    const component = render().point.componentInstance;
    const alpha = data.teams[0];

    component.toggleExpand('a');

    // Default sort is total: rows lead with the highest-scoring player.
    expect(component.rosterRows(alpha).map((row) => row.name)).toEqual([
      'McDavid',
      'Point',
      'Zacha',
      'Nylander',
      'Makar',
    ]);

    // Sort by Goals (desc): Zacha leads on goals (55) despite a middling total, so he rises.
    component.sortBy('goals');
    expect(component.rosterRows(alpha).map((row) => row.name)).toEqual([
      'Zacha',
      'McDavid',
      'Point',
      'Nylander',
      'Makar',
    ]);

    // Ascending flips the order; the goalie (no goals) still sinks to the very bottom.
    component.toggleShowAll('a');
    component.sortBy('goals');
    const ascending = component.rosterRows(alpha).map((row) => row.name);
    expect(ascending).toEqual(['Makar', 'Nylander', 'Point', 'McDavid', 'Zacha', 'Oettinger']);
  });

  it('expands teams independently, and keeps show-all scoped to the team it was toggled on', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;
    const [alpha, bravo] = data.teams;

    component.toggleExpand('a');
    component.toggleExpand('b');
    fixture.detectChanges();

    // Opening a second team must not close the first.
    expect(component.isExpanded('a')).toBe(true);
    expect(component.isExpanded('b')).toBe(true);

    component.toggleShowAll('a');
    fixture.detectChanges();

    // Show-all belongs to Alpha alone — Bravo's list stays as it was.
    expect(component.isShowingAll('a')).toBe(true);
    expect(component.isShowingAll('b')).toBe(false);
    expect(component.rosterRows(alpha).length).toEqual(6);
    expect(component.rosterRows(bravo).map((row) => row.name)).toEqual(['Crosby', 'Vasilevskiy']);

    // Collapsing Alpha leaves Bravo open.
    component.toggleExpand('a');
    expect(component.isExpanded('a')).toBe(false);
    expect(component.isExpanded('b')).toBe(true);
  });

  it('keeps the per-cell lists in the position breakdown, where a player owns one slot', () => {
    const component = render().point.componentInstance;
    const alpha = data.teams[0];

    component.setMode('position');
    component.toggleExpand('a');

    // No roster rows here — each player already appears exactly once, inside their slot column.
    expect(component.showsRosterRows()).toBe(false);
    expect(component.hasHiddenPlayers(alpha)).toBe(false);
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

  it("lays the pinned total column's heat over an opaque fill, as a background image", () => {
    const component = render().point.componentInstance;

    // The score column is pinned while the stats scroll beneath it, so its tint rides on a
    // background image and leaves the stylesheet's opaque background colour in place.
    expect(component.totalShade(30)).toMatch(/^linear-gradient\(rgba\(22, 163, 74/);
    expect(component.totalShade(20)).toMatch(/^linear-gradient\(rgba\(233, 69, 96/);
  });

  it('pins the total column and casts its edge shadow only while columns sit beneath it', () => {
    const fixture = render();
    const wrap = () => fixture.nativeElement.querySelector('.lp-wrap') as HTMLElement;

    // jsdom lays nothing out, so the table never overflows here and the shadow stays off.
    expect(wrap().classList.contains('has-more')).toBe(false);

    fixture.point.componentInstance.canScrollRight.set(true);
    fixture.detectChanges();
    expect(wrap().classList.contains('has-more')).toBe(true);
  });
});
