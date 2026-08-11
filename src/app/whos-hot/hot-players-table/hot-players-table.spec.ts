import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { HotPlayersTableComponent } from './hot-players-table';
import { HotPlayer } from '../../services/whos-hot.service';
import { Player } from '../../models/player.model';
import { SkaterPosition } from '../../models/position.model';
import { ActiveColumns, ScoringType } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { DEFAULT_STAT_WEIGHTS } from '../../draft-projection/projection-defaults';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { PositionFilterService } from '../../services/position-filter.service';
import { ActiveColumnsService } from '../../services/active-columns.service';
import { StatInfoService } from '../../services/stat-info.service';

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

function skater(playerId: number, games: number, goals = 10): HotPlayer {
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
        utility: { gp: games, toiPerGame: 1200 },
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
      .keep(StatInfoService),
  );

  const activeColumns: ActiveColumns = {
    scoring: new Set<ScoringStatKey>(['goals', 'assists', 'hits', 'blocks']),
    utility: new Set(['gp']),
  };

  const render = (
    hotPlayers: HotPlayer[],
    overrides: { perGame?: boolean; minGames?: number; scoringType?: ScoringType } = {},
  ) =>
    MockRender(HotPlayersTableComponent, {
      hotPlayers,
      players: hotPlayers.map((hot) => player(hot.projection.playerId)),
      activeColumns,
      scoringType: overrides.scoringType ?? 'points',
      statWeights: DEFAULT_STAT_WEIGHTS,
      perGame: overrides.perGame ?? false,
      minGames: overrides.minGames ?? 1,
    }).point.componentInstance;

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
    const component = render([skater(1, 3), skater(2, 20)], { minGames: 5 });

    expect(component.matchingCount()).toEqual(1);
    expect(component.visiblePlayers()[0].projection.playerId).toEqual(2);
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
    expect(perGame.decimalsFor('goals')).toEqual('1.0-2');
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
    expect(firstRow.textContent).toContain('14 GP');
    // The measurement already happened, so nothing in the body is editable.
    expect(firstRow.querySelectorAll('input')).toHaveLength(0);
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
    render([skater(1, 2)], { minGames: 10 });

    expect(ngMocks.findAll('tbody tr')).toHaveLength(0);
    expect(ngMocks.find('.table-empty').nativeElement.textContent).toContain('No players match');
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
