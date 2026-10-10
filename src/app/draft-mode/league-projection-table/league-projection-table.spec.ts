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
            team: 'EDM',
            positions: ['C'],
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
    const toggle = fixture.nativeElement.querySelector('.lp-showall') as HTMLElement;
    expect(toggle.textContent?.trim()).toBe('Show all');
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

  it('tags a parked player by his slot and fades one the team does not count', () => {
    const slots: Record<string, string> = { Oettinger: 'IR+', Makar: 'NA' };
    const roster = data.teams[0].roster.map((row) =>
      row.name === 'Oettinger'
        ? { ...row, total: 0, fullValue: 1.5, reserveSlot: slots[row.name], counted: false }
        : { ...row, reserveSlot: slots[row.name] ?? null, counted: true },
    );
    const fixture = MockRender(LeagueProjectionTableComponent, {
      data: { ...data, teams: [{ ...data.teams[0], roster }] },
      scoringType: 'category',
      scoreHeading: 'Z-Score',
    });
    const component = fixture.point.componentInstance;
    component.toggleExpand('a');
    component.toggleShowAll('a');
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('tr.lp-player-row')] as HTMLElement[];
    const rowOf = (name: string) =>
      rows.find((row) => row.querySelector('.lp-player-name')?.textContent?.trim() === name)!;
    expect(rowOf('Oettinger').querySelector('.lp-reserve-badge')?.textContent?.trim()).toBe('IR');
    expect(rowOf('Makar').querySelector('.lp-reserve-badge')?.textContent?.trim()).toBe('NA');
    expect(rowOf('Oettinger').classList).toContain('not-counted');
    expect(rowOf('McDavid').querySelector('.lp-reserve-badge')).toBeNull();
    expect(rowOf('McDavid').classList).not.toContain('not-counted');
  });

  it('shows what an uncounted player would add, starred, and says why under the table', () => {
    const roster = data.teams[0].roster.map((row) =>
      row.name === 'Oettinger'
        ? { ...row, total: 0, fullValue: 1.5, counted: false }
        : { ...row, fullValue: row.total, counted: true },
    );
    const fixture = MockRender(LeagueProjectionTableComponent, {
      data: { ...data, teams: [{ ...data.teams[0], roster }] },
      scoringType: 'category',
      scoreHeading: 'Z-Score',
    });
    const component = fixture.point.componentInstance;
    const footnote = () =>
      fixture.nativeElement.querySelector('.lp-footnote') as HTMLElement | null;
    component.toggleExpand('a');
    fixture.detectChanges();
    expect(footnote(), 'no uncounted player among the top five').toBeNull();

    component.toggleShowAll('a');
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('tr.lp-player-row')] as HTMLElement[];
    const totalOf = (name: string) =>
      rows
        .find((row) => row.querySelector('.lp-player-name')?.textContent?.trim() === name)!
        .querySelector('.col-total')!
        .textContent.replace(/\s+/g, '');
    expect(totalOf('Oettinger')).toBe('1.50*');
    expect(totalOf('McDavid')).not.toContain('*');
    expect(footnote()?.textContent).toContain("Player not included in the team's total.");
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

  it('opens a team in the position breakdown into one lineup row under it, on its own cells', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;
    const alpha = data.teams[0];

    component.setMode('position');
    component.toggleExpand('a');
    fixture.detectChanges();

    // The team's own cells hold the totals and nothing else; the players are the row beneath.
    expect(fixture.nativeElement.querySelector('tr.lp-row ul')).toBeNull();
    const lineup = fixture.nativeElement.querySelectorAll('tr.lp-lineup-row');
    expect(lineup).toHaveLength(1);
    expect(lineup[0].querySelectorAll('td')).toHaveLength(
      fixture.nativeElement.querySelectorAll('thead th').length,
    );
    expect(lineup[0].textContent).toContain('McDavid');
    expect(lineup[0].textContent).toContain('Makar');

    // The club comes from the team's roster, by name; a player it does not name has none.
    expect(component.clubOf(alpha, 'McDavid')).toBe('EDM');
    expect(component.clubOf(alpha, 'Makar')).toBeNull();
  });

  it("shortens a lineup player's first name to its initial, to fit his slot's column", () => {
    const component = MockRender(LeagueProjectionTableComponent, {
      data: {
        ...data,
        teams: [
          {
            ...data.teams[0],
            positionPlayers: {
              C: [
                { name: 'Connor McDavid', value: 6 },
                { name: 'Jordan Staal', value: 2 },
                { name: 'Jared Staal', value: 1 },
              ],
            },
          },
        ],
      },
      scoringType: 'category',
      scoreHeading: 'Z-Score',
    }).point.componentInstance;
    const alpha = component.data().teams[0];

    expect(component.slotName(alpha, 'Connor McDavid')).toBe('C. McDavid');
    // Two names one short form would stand for keep their full names.
    expect(component.slotName(alpha, 'Jordan Staal')).toBe('Jordan Staal');
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

  it('shades cells on a diverging teal-orange scale, including the total column', () => {
    const component = render().point.componentInstance;

    // Column leader trends teal, laggard orange (goals: a=6 is the min, b=8 the max).
    expect(component.shade('goals', 8)).toContain('rgba(13, 148, 136');
    expect(component.shade('goals', 6)).toContain('rgba(234, 88, 12');

    // The total column carries the same heat (a.total=20 min, b.total=30 max).
    expect(component.shade('total', 30)).toContain('rgba(13, 148, 136');
    expect(component.shade('total', 20)).toContain('rgba(234, 88, 12');

    // Missing values stay clear.
    expect(component.shade('goals', null)).toEqual('transparent');
  });

  it('draws the heat as a chip inside each team cell, the pinned total included', () => {
    const fixture = render();
    const bravo = fixture.nativeElement.querySelector('tr.lp-row') as HTMLElement;

    // Bravo leads on total and on goals: both chips carry the leader's tint, and the cells
    // themselves stay the row's own opaque colour for the pinned columns to scroll over.
    const chips = Array.from(bravo.querySelectorAll<HTMLElement>('.lp-heat'));
    expect(chips).toHaveLength(data.categoryColumns.length + 1);
    expect(chips[0].style.getPropertyValue('--heat')).toContain('rgba(13, 148, 136');
    expect(chips.at(-1)?.style.getPropertyValue('--heat')).toContain('rgba(13, 148, 136');
    expect((bravo.querySelector('td.col-total') as HTMLElement).style.background).toBe('');
  });

  // The row once spanned the stat columns and the score with one cell, which cut the score
  // column's divider and the sorted column's marking in two at exactly that row.
  it('gives the show-all row a cell under every column, so no column breaks at it', () => {
    const fixture = render();
    fixture.point.componentInstance.toggleExpand('a');
    fixture.point.componentInstance.sortBy('goals');
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tr.lp-showall-row') as HTMLElement;
    const headers = fixture.nativeElement.querySelectorAll('thead th');
    expect(row.querySelectorAll('td')).toHaveLength(headers.length);
    expect(row.querySelector('td[colspan]')).toBeNull();
    expect(row.querySelector('td.col-total')).not.toBeNull();
    expect(row.querySelectorAll('td.sorted')).toHaveLength(1);
  });

  it("stresses the team's best figure in each column of its player rows", () => {
    const component = render().point.componentInstance;
    const alpha = data.teams[0];
    const named = (name: string) => alpha.roster.find((row) => row.name === name)!;

    // Zacha gives Alpha the most goals; McDavid, for all his total, does not.
    expect(component.isTeamBest(alpha, named('Zacha'), 'goals')).toBe(true);
    expect(component.isTeamBest(alpha, named('McDavid'), 'goals')).toBe(false);
    // A stat that is not his kind is never his best.
    expect(component.isTeamBest(alpha, named('Oettinger'), 'goals')).toBe(false);
    expect(component.isTeamBest(alpha, named('Oettinger'), 'gaa')).toBe(true);
  });

  it('rules off the goalie stats from the skater stats, in the category breakdown only', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;

    expect(component.groupStartKey()).toBe('gaa');
    expect(fixture.nativeElement.querySelectorAll('thead th.group-start')).toHaveLength(1);

    component.setMode('position');
    expect(component.groupStartKey()).toBeNull();
  });

  it('leads each player with his club crest only where the rows came with clubs', () => {
    const fixture = render();
    fixture.point.componentInstance.toggleExpand('a');
    fixture.detectChanges();

    // One row names a club, so every row keeps the slot and the names stay in line.
    expect(fixture.point.componentInstance.showsClubs()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('tr.lp-player-row app-team-logo')).toHaveLength(
      5,
    );
    expect(fixture.nativeElement.querySelectorAll('app-position-chips')).toHaveLength(1);

    const bare = MockRender(LeagueProjectionTableComponent, {
      data: {
        ...data,
        teams: data.teams.map((team) => ({
          ...team,
          roster: team.roster.map((row) => ({ ...row, team: null })),
        })),
      },
      scoringType: 'category',
      scoreHeading: 'Z-Score',
    });
    bare.point.componentInstance.toggleExpand('a');
    bare.detectChanges();
    expect(bare.nativeElement.querySelector('app-team-logo')).toBeNull();
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
