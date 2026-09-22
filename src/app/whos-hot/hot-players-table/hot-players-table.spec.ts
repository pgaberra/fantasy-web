import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { HotPlayersTableComponent } from './hot-players-table';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { HotPlayer } from '../../services/whos-hot.service';
import { Player } from '../../models/player.model';
import { SkaterPosition } from '../../models/position.model';
import { ActiveColumns, ScoringType } from '../../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../models/stat-key.model';
import { DEFAULT_STAT_WEIGHTS } from '../../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../../draft-projection/projection-settings-section/model';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { PositionFilterService } from '../../services/position-filter.service';
import { ActiveColumnsService } from '../../services/active-columns.service';
import { StatInfoService } from '../../services/stat-info.service';
import { FormatToiPipe } from '../../pipes/format-toi.pipe';
import { ProjectionsTableHeaderComponent } from '../../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { DecimalPipe } from '@angular/common';

const SKATER_STATS = {
  goals: 10,
  assists: 20,
  points: 30,
  plusMinus: 5,
  pim: 8,
  ppg: 3,
  ppa: 6,
  ppp: 9,
  shg: 0,
  sha: 0,
  shp: 0,
  stpg: 3,
  stpa: 6,
  stp: 9,
  gwg: 2,
  hatTricks: 1,
  sog: 60,
  shPct: 16.7,
  fw: 100,
  fl: 80,
  hits: 24,
  blocks: 12,
  defPoints: 0,
  shifts: 900,
  toi: 60000,
};

function skater(playerId: number, games: number, goals = 10, toiPerGame = 1200): HotPlayer {
  return {
    name: `Skater ${playerId}`,
    teamAbbrev: 'EDM',
    games,
    firstTeamGame: 63,
    lastTeamGame: 82,
    projection: {
      type: 'skater',
      playerId,
      stats: {
        scoring: { ...SKATER_STATS, goals },
        utility: { gp: games, toiPerGame },
      },
    },
  };
}

function player(playerId: number, positions: SkaterPosition[] = ['C']): Player {
  return {
    type: 'skater',
    id: playerId,
    name: `Skater ${playerId}`,
    teamAbbrev: 'EDM',
    positions: new Set(positions),
    stats: { scoring: SKATER_STATS, utility: { gp: 82, toiPerGame: 1200 } },
  };
}

describe('HotPlayersTableComponent', () => {
  beforeEach(() =>
    MockBuilder(HotPlayersTableComponent)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(ActiveColumnsService)
      .keep(StatInfoService)
      .keep(FormatToiPipe)
      .keep(DecimalPipe),
  );

  const activeColumns: ActiveColumns = {
    scoring: new Set<ScoringStatKey>(['goals', 'assists', 'hits', 'blocks']),
    utility: new Set(['gp']),
  };

  const render = (
    hotPlayers: HotPlayer[],
    overrides: {
      perGame?: boolean;
      minGames?: number;
      scoringType?: ScoringType;
      syncedLeagueName?: string | null;
    } = {},
  ) =>
    MockRender(HotPlayersTableComponent, {
      hotPlayers,
      players: hotPlayers.map((hot) => player(hot.projection.playerId)),
      activeColumns,
      scoringType: overrides.scoringType ?? 'points',
      statWeights: DEFAULT_STAT_WEIGHTS,
      perGame: overrides.perGame ?? false,
      minGames: overrides.minGames ?? 1,
      syncedLeagueName: overrides.syncedLeagueName ?? null,
      seasonLabel: '2025-26',
    }).point.componentInstance;

  it('tells an empty season apart from a filter that matched nobody', () => {
    // Nothing came back at all: a season on the dropdown that has not been played yet.
    expect(render([]).seasonNotPlayed()).toBe(true);

    const filteredOut = render([skater(1, 20)]);
    filteredOut.searchTerm.set('nobody by that name');

    expect(filteredOut.seasonNotPlayed()).toBe(false);
    expect(filteredOut.matchingCount()).toEqual(0);
  });

  describe('while its rows are pending', () => {
    const template = `
      <app-hot-players-table
        [hotPlayers]="hotPlayers"
        [players]="players"
        [activeColumns]="activeColumns"
        scoringType="points"
        [statWeights]="statWeights"
        seasonLabel="2025-26"
        [rowsPending]="rowsPending"
      >
        <p table-status class="status">Loading</p>
      </app-hot-players-table>
    `;
    const renderPending = (rowsPending: boolean) =>
      MockRender(template, {
        hotPlayers: [skater(1, 20)],
        players: [player(1)],
        activeColumns,
        statWeights: DEFAULT_STAT_WEIGHTS,
        rowsPending,
      });

    it('shows the page status in place of the rows, and keeps the toolbar', () => {
      const fixture = renderPending(true);
      const element: HTMLElement = fixture.nativeElement;

      expect(element.querySelector('.status')?.textContent).toContain('Loading');
      expect(element.querySelector('table')).toBeNull();
      expect(element.querySelector('app-position-filter')).not.toBeNull();
    });

    it('keeps the filters it was given once the rows come back', () => {
      const fixture = renderPending(false);
      const table = ngMocks.findInstance(HotPlayersTableComponent);
      table.setPositionFilter('D');
      table.teamFilter.set('EDM');
      table.searchTerm.set('Skater');

      fixture.componentInstance.rowsPending = true;
      fixture.detectChanges();
      fixture.componentInstance.rowsPending = false;
      fixture.detectChanges();

      expect(ngMocks.findInstance(HotPlayersTableComponent)).toBe(table);
      expect(table.positionFilter()).toEqual('D');
      expect(table.teamFilter()).toEqual('EDM');
      expect(table.searchTerm()).toEqual('Skater');
      expect(fixture.nativeElement.querySelector('.status')).toBeNull();
    });
  });

  describe('headshots', () => {
    const renderWithPlayers = (players: Player[]) => {
      const fixture = MockRender(HotPlayersTableComponent, {
        hotPlayers: [skater(1, 20), skater(2, 20)],
        players,
        activeColumns,
        scoringType: 'points',
        statWeights: DEFAULT_STAT_WEIGHTS,
        seasonLabel: '2025-26',
      });
      fixture.detectChanges();
      return fixture.nativeElement.querySelectorAll('app-player-headshot').length;
    };

    it('draws none while no player has a picture', () => {
      expect(renderWithPlayers([player(1), player(2)])).toEqual(0);
    });

    it('draws one on every row once any player has a picture', () => {
      expect(
        renderWithPlayers([{ ...player(1), headshot: 'https://cdn.test/1.png' }, player(2)]),
      ).toEqual(2);
    });
  });

  // The same coloured chips the editor and the draft board draw, rather than "(C/LW)" in words.
  it("draws each row's positions as chips, and none for a skater the pool does not hold", () => {
    const fixture = MockRender(HotPlayersTableComponent, {
      hotPlayers: [skater(1, 20, 12), skater(2, 20, 10), skater(3, 20, 8)],
      players: [player(1, ['C', 'LW']), player(2, ['D'])],
      activeColumns,
      scoringType: 'points',
      statWeights: DEFAULT_STAT_WEIGHTS,
      seasonLabel: '2025-26',
    });
    fixture.detectChanges();

    expect(
      ngMocks
        .findAll(fixture, PositionChipsComponent)
        .map((chips) => chips.componentInstance.positions()),
    ).toEqual([['C', 'LW'], ['D'], []]);
  });

  it('offers no League setup in a points league that has imported nothing — the menu would be empty', () => {
    const component = render([skater(1, 20)]);

    expect(component.hasLeagueSetup()).toBe(false);
  });

  it('offers League setup once the ranking is by category, or once a league has been imported', () => {
    expect(render([skater(1, 20)], { scoringType: 'category' }).hasLeagueSetup()).toBe(true);
    expect(render([skater(1, 20)], { syncedLeagueName: 'My league' }).hasLeagueSetup()).toBe(true);
  });

  it('re-ranks by z-score when the toolbar switches the league to categories', () => {
    const component = render([skater(1, 20)]);

    component.selectScoringType('category');

    expect(component.summaryValue(component.visiblePlayers()[0])).toEqual(
      component.visiblePlayers()[0].score.zScore,
    );
  });

  it('adds and removes a scoring column from the Stats menu', () => {
    const component = render([skater(1, 20)]);

    component.toggleScoringColumn('pim');
    expect(component.activeScoringColumns().has('pim')).toBe(true);

    component.toggleScoringColumn('pim');
    expect(component.activeScoringColumns().has('pim')).toBe(false);
  });

  it('adds and removes a utility column from the same menu', () => {
    const component = render([skater(1, 20)]);

    component.toggleUtilityColumn('toiPerGame');
    expect(component.activeUtilityColumns().has('toiPerGame')).toBe(true);

    component.toggleUtilityColumn('toiPerGame');
    expect(component.activeUtilityColumns().has('toiPerGame')).toBe(false);
  });

  it('ranks by total fantasy points by default', () => {
    const component = render([skater(1, 20, 5), skater(2, 20, 15)]);

    expect(component.visiblePlayers()[0].projection.playerId).toEqual(2);
  });

  it('divides counting stats by games played in the per-game view', () => {
    const component = render([skater(1, 20, 10)], { perGame: true });

    expect(component.statValue(component.visiblePlayers()[0], 'goals')).toBeCloseTo(0.5);
    expect(component.statValue(component.visiblePlayers()[0], 'hits')).toBeCloseTo(1.2);
  });

  it('leaves rate stats alone in the per-game view — a percentage is already a ratio', () => {
    const component = render([skater(1, 20)], { perGame: true });

    expect(component.statValue(component.visiblePlayers()[0], 'shPct')).toEqual(SKATER_STATS.shPct);
  });

  it('lets a part-time player out-rank an ironman once measured per game', () => {
    const partTime = skater(1, 10, 12);
    const ironman = skater(2, 20, 16);

    const totals = render([partTime, ironman]);
    const perGame = render([partTime, ironman], { perGame: true });

    expect(totals.visiblePlayers()[0].projection.playerId).toEqual(2);
    expect(perGame.visiblePlayers()[0].projection.playerId).toEqual(1);
  });

  it('drops players below the minimum-games threshold entirely', () => {
    const component = render([skater(1, 3), skater(2, 20)], { perGame: true, minGames: 5 });

    expect(component.matchingCount()).toEqual(1);
    expect(component.visiblePlayers()[0].projection.playerId).toEqual(2);
  });

  it('ignores the minimum-games threshold while the leaderboard shows totals', () => {
    const component = render([skater(1, 3), skater(2, 20)], { minGames: 5 });

    expect(component.matchingCount()).toEqual(2);
  });

  it('shows games played from the range, not the season', () => {
    const component = render([skater(1, 14)]);

    expect(component.visiblePlayers()[0].hot.games).toEqual(14);
  });

  it('sorts by a stat column and flips direction when clicked again', () => {
    const component = render([skater(1, 20, 5), skater(2, 20, 15)]);

    component.onSort('goals');
    expect(component.visiblePlayers()[0].projection.playerId).toEqual(2);

    component.onSort('goals');
    expect(component.visiblePlayers()[0].projection.playerId).toEqual(1);
  });

  it('filters by search term', () => {
    const component = render([skater(1, 20), skater(2, 20)]);

    component.searchTerm.set('Skater 2');

    expect(component.matchingCount()).toEqual(1);
  });

  it('gives per-game counting stats enough decimals to stay distinguishable', () => {
    const totals = render([skater(1, 20)]);
    const perGame = render([skater(1, 20)], { perGame: true });

    expect(totals.decimalsFor('goals')).toEqual('1.0-0');
    expect(perGame.decimalsFor('goals')).toEqual('1.2-2');
  });

  it('keeps games played whole in the per-game view, since it is never divided', () => {
    const perGame = render([skater(1, 20)], { perGame: true });

    expect(perGame.decimalsFor('gp')).toEqual('1.0-0');
  });

  it('shows a column as many decimals as it is set to, trailing zeros included', () => {
    const component = render([skater(1, 20)]);

    component.decimalSettings.set({ ...DEFAULT_DECIMAL_SETTINGS, sog: 3 });

    expect(component.decimalsFor('sog')).toEqual('1.3-3');
  });

  it('offers only the teams present in the range', () => {
    const component = render([skater(1, 20)]);

    expect(component.availableTeams()).toEqual(['EDM']);
  });

  it('renders a row per ranked player, with the range games and no editable stat inputs', () => {
    render([skater(1, 20, 5), skater(2, 14, 15)]);

    const rows = ngMocks.findAll('tbody tr');
    expect(rows).toHaveLength(2);

    const firstRow = rows[0].nativeElement as HTMLElement;
    expect(firstRow.textContent).toContain('Skater 2');
    // Games played is the GP column and nothing else — it used to be repeated as a pill
    // beside the name, which said the same thing twice in the one cell that has least room.
    expect(ngMocks.formatText(ngMocks.findAll('tbody tr td.col-gp')[0])).toEqual('14');
    expect(firstRow.textContent).not.toContain('14 GP');
    // The measurement already happened, so nothing in the body is editable.
    expect(firstRow.querySelectorAll('input')).toHaveLength(0);
  });

  it('tells the header that GP here is counted over the chosen range, not a season', () => {
    render([skater(1, 20)]);

    // The heading is the same 'GP' the projection editor shows, where it means games in a
    // year. Only the caller knows this one was measured over a stretch of the schedule.
    const header = ngMocks.find(ProjectionsTableHeaderComponent);
    expect(ngMocks.input(header, 'gamesPlayedScope')).toEqual('the selected game range');
  });

  it('marks the summary cell as the pinned column so it paints over the scrolled stats', () => {
    render([skater(1, 20)]);

    // `fan-pts-col` is what styles.css pins to the right edge above 1024px, and what it
    // hands the z-index and gold edge to. Renaming it leaves the cell sticky but flat and
    // transparent, and the stat columns scroll visibly through the total.
    const summary = ngMocks.find('tbody tr td:last-child').nativeElement as HTMLElement;
    expect(summary.classList.contains('fan-pts-col')).toEqual(true);
  });

  it('shows the empty state rather than a bare table when nothing qualifies', () => {
    render([skater(1, 2)], { perGame: true, minGames: 10 });

    expect(ngMocks.findAll('tbody tr')).toHaveLength(0);
    expect(ngMocks.find('.table-empty').nativeElement.textContent).toContain('No players match');
  });

  describe('time on ice per game', () => {
    const withToi = (hotPlayers: HotPlayer[], perGame = false) =>
      MockRender(HotPlayersTableComponent, {
        hotPlayers,
        players: hotPlayers.map((hot) => player(hot.projection.playerId)),
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(['gp', 'toiPerGame']),
        },
        scoringType: 'points',
        statWeights: DEFAULT_STAT_WEIGHTS,
        perGame,
        minGames: 1,
      }).point.componentInstance;

    it('is a column of its own, shown as a clock rather than a count', () => {
      const component = withToi([skater(1, 20)]);

      expect([...component.filteredActiveColumns().utility]).toEqual(['gp', 'toiPerGame']);
      expect(component.statValue(component.visiblePlayers()[0], 'toiPerGame')).toEqual(1200);
      // 1200 seconds is twenty minutes a night, not a count of twelve hundred of anything.
      expect(ngMocks.formatText(ngMocks.find('tbody tr td.col-toiPerGame'))).toEqual('20:00');
    });

    it('is already a per-game number, so the per-game view must not divide it again', () => {
      const component = withToi([skater(1, 20)], true);

      expect(component.statValue(component.visiblePlayers()[0], 'toiPerGame')).toEqual(1200);
    });

    it('sorts on it like any other column', () => {
      const component = withToi([skater(1, 20, 10, 900), skater(2, 20, 10, 1500)]);

      component.onSort('toiPerGame');
      expect(component.visiblePlayers()[0].projection.playerId).toEqual(2);

      component.onSort('toiPerGame');
      expect(component.visiblePlayers()[0].projection.playerId).toEqual(1);
    });
  });

  describe('a sorted column the position filter takes away', () => {
    const withWins = () =>
      MockRender(HotPlayersTableComponent, {
        hotPlayers: [skater(1, 20)],
        players: [player(1)],
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'w']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
        scoringType: 'points',
        statWeights: DEFAULT_STAT_WEIGHTS,
        perGame: false,
        minGames: 1,
      }).point.componentInstance;

    it('falls back to the ranking rather than an order nothing explains', () => {
      const component = withWins();

      component.onSort('w');
      component.setPositionFilter('SKATER');

      expect(component.sortColumn()).toEqual('summary');
      expect(component.sortDirection()).toEqual('desc');
    });

    it('leaves a sorted column the filter still shows', () => {
      const component = withWins();

      component.onSort('goals');
      component.setPositionFilter('SKATER');

      expect(component.sortColumn()).toEqual('goals');
    });
  });

  describe('stats the player cannot have', () => {
    const withColumns = (scoring: ScoringStatKey[], positions: SkaterPosition[]) =>
      MockRender(HotPlayersTableComponent, {
        hotPlayers: [skater(1, 20)],
        players: [player(1, positions)],
        activeColumns: { scoring: new Set(scoring), utility: new Set(['gp']) },
        scoringType: 'points',
        statWeights: DEFAULT_STAT_WEIGHTS,
        perGame: false,
        minGames: 1,
      });

    const cellTexts = () =>
      ngMocks.findAll('tbody tr td').map((cell) => cell.nativeElement.textContent!.trim());

    it("shows a dash for a skater's goalie stats rather than a measured zero", () => {
      withColumns(['goals', 'svPct'], ['C']);

      // The split fills every key so the ranking engine gets a complete line; a zero here
      // would claim this skater faced shots and stopped none of them.
      expect(cellTexts()).toContain('-');
      expect(ngMocks.findAll('tbody .stat-placeholder')).toHaveLength(1);
    });

    it('shows a dash for a forward on defencemen points', () => {
      withColumns(['defPoints'], ['C']);

      expect(ngMocks.findAll('tbody .stat-placeholder')).toHaveLength(1);
    });

    it('shows the number for a defenceman on the same column', () => {
      withColumns(['defPoints'], ['D']);

      expect(ngMocks.findAll('tbody .stat-placeholder')).toHaveLength(0);
    });

    it('keeps a stat both positions are scored on', () => {
      withColumns(['goals'], ['C']);

      expect(ngMocks.findAll('tbody .stat-placeholder')).toHaveLength(0);
    });
  });
});
