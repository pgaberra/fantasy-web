import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerProjectionsTableComponent } from './player-projections-table';
import { Goalie, Player, Skater } from '../../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../models/stat-key.model';
import { StatInfoService } from '../../services/stat-info.service';
import {
  ActiveColumns,
  GoalieProjection,
  Projection,
  ScoringType,
  SkaterProjection,
} from '../../models/projection.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { FormatToiPipe } from '../../pipes/format-toi.pipe';
import { DecimalPipe } from '@angular/common';
import { ProjectionsTableHeaderComponent } from './projections-table-header/projections-table-header';
import { PlayerRowComponent } from './player-row/player-row';
import { StatInputComponent } from './player-row/stat-input/stat-input';
import { ScaleConfig } from '../projection-settings-section/model';

describe('PlayerProjectionsTableComponent', () => {
  const mockPlayers: Player[] = [
    {
      id: 1,
      type: 'skater',
      name: 'Connor McDavid',
      positions: new Set(['C']),
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: {
          goals: 64,
          assists: 89,
          plusMinus: 33,
          pim: 36,
          ppg: 22,
          ppa: 38,
          shg: 1,
          sha: 0,
          gwg: 8,
          sog: 348,
          shPct: 18.4,
          fw: 812,
          fl: 623,
          hits: 42,
          blocks: 28,
        },
      },
    },
    {
      id: 2,
      type: 'skater',
      name: 'Leon Draisaitl',
      positions: new Set(['C', 'LW']),
      stats: {
        utility: { gp: 80, toiPerGame: 1260 },
        scoring: {
          goals: 52,
          assists: 76,
          plusMinus: 18,
          pim: 58,
          ppg: 21,
          ppa: 34,
          shg: 1,
          sha: 2,
          gwg: 6,
          sog: 298,
          shPct: 17.4,
          fw: 367,
          fl: 298,
          hits: 51,
          blocks: 19,
        },
      },
    },
    {
      id: 3,
      type: 'goalie',
      name: 'Connor Hellebuyck',
      stats: {
        utility: { gp: 64 },
        scoring: {
          gs: 64,
          w: 37,
          l: 22,
          sho: 5,
          sa: 1890,
          sv: 1740,
          ga: 150,
          gaa: 2.39,
          svPct: 0.921,
        },
      },
    },
  ];

  const mockPlayerProjections: Projection[] = [
    {
      type: 'skater',
      playerId: 1,
      stats: {
        scoring: (mockPlayers[0] as Skater).stats.scoring,
        utility: (mockPlayers[0] as Skater).stats.utility,
      },
    },
    {
      type: 'skater',
      playerId: 2,
      stats: {
        scoring: (mockPlayers[1] as Skater).stats.scoring,
        utility: (mockPlayers[1] as Skater).stats.utility,
      },
    },
    {
      type: 'goalie',
      playerId: 3,
      stats: {
        scoring: (mockPlayers[2] as Goalie).stats.scoring,
        utility: (mockPlayers[2] as Goalie).stats.utility,
      },
    },
  ];

  const mockStatWeights: Record<ScoringStatKey, number> = {
    goals: 4.5,
    assists: 3,
    sog: 0.5,
    hits: 0.33,
    blocks: 0.5,
    gwg: 0.5,
    pim: 0.5,
    ppg: 0.5,
    ppa: 0.5,
    shg: 0.5,
    sha: 0.5,
    shPct: 0.5,
    fw: 0.5,
    fl: 0.5,
    plusMinus: 0.5,
    gs: 0,
    w: 4,
    l: 0,
    sho: 3,
    sa: 0,
    sv: 0.2,
    ga: -1,
    gaa: 0,
    svPct: 0,
  };

  const mockScaleSettings: Record<string, ScaleConfig> = {
    gp: { scale: true, scalableStats: new Set(['goals', 'assists']) },
    toiPerGame: { scale: true, scalableStats: new Set(['goals', 'assists']) },
  };

  beforeEach(() =>
    MockBuilder(PlayerProjectionsTableComponent)
      .keep(ProjectionsTableHeaderComponent)
      .keep(PlayerRowComponent)
      .keep(StatInputComponent)
      .keep(StatLabelPipe)
      .keep(FormatToiPipe)
      .keep(DecimalPipe)
      .keep(StatInfoService),
  );

  const getComponent = (
    overrides: Partial<{
      players: Player[];
      scoringType: ScoringType;
      playerProjections: Projection[];
      statWeights: Record<ScoringStatKey, number>;
      activeColumns: ActiveColumns;
      scaleSettings: Record<string, ScaleConfig>;
      useDefaultDecimals: boolean;
    }> = {},
  ) =>
    MockRender(PlayerProjectionsTableComponent, {
      players: mockPlayers,
      scoringType: 'category' as ScoringType,
      playerProjections: mockPlayerProjections,
      statWeights: mockStatWeights,
      activeColumns: {
        scoring: new Set<ScoringStatKey>(['goals', 'assists']),
        utility: new Set<SkaterUtilityStatKey>(['gp']),
      } as ActiveColumns,
      scaleSettings: mockScaleSettings,
      useDefaultDecimals: true,
      ...overrides,
    }).point.componentInstance;

  describe('onStatInput', () => {
    it('should update a scoring stat with a numeric value', () => {
      const component = getComponent();
      const event = { target: { value: '70' } } as unknown as Event;
      component.onStatInput(1, 'goals', event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(70);
    });

    it('should parse a plain number for non-toiPerGame utility stats', () => {
      const component = getComponent();
      const event = { target: { value: '42' } } as unknown as Event;
      component.onStatInput(1, 'gp', event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.gp,
      ).toEqual(42);
    });

    it('should parse mm:ss format for toiPerGame', () => {
      const component = getComponent();
      const event = { target: { value: '25:55' } } as unknown as Event;
      component.onStatInput(1, 'toiPerGame', event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.toiPerGame,
      ).toEqual(1555);
    });

    it('should not modify other players when updating a stat', () => {
      const component = getComponent();
      const before = (
        component.playerProjections().find((p) => p.playerId === 2) as SkaterProjection
      ).stats.scoring.goals;
      component.onStatInput(1, 'goals', { target: { value: '99' } } as unknown as Event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 2) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(before);
    });

    it('should clamp shPct to 100', () => {
      const component = getComponent();
      const event = { target: { value: '110' } } as unknown as Event;
      component.onStatInput(1, 'shPct', event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.shPct,
      ).toEqual(100);
    });

    it('should clamp svPct to 100', () => {
      const component = getComponent();
      const event = { target: { value: '110' } } as unknown as Event;
      component.onStatInput(3, 'svPct', event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 3) as GoalieProjection).stats
          .scoring.svPct,
      ).toEqual(100);
    });
  });

  describe('onToiKeydown', () => {
    it('should increment toiPerGame by 1 second on ArrowUp', () => {
      const component = getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        } as ActiveColumns,
      });
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      vi.spyOn(event, 'preventDefault');
      component.onToiKeydown(1, event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.toiPerGame,
      ).toEqual(1321);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should decrement toiPerGame by 1 second on ArrowDown', () => {
      const component = getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        } as ActiveColumns,
      });
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      vi.spyOn(event, 'preventDefault');
      component.onToiKeydown(1, event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.toiPerGame,
      ).toEqual(1319);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not go below 0 seconds on ArrowDown', () => {
      const component = getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        } as ActiveColumns,
      });
      // Set toiPerGame to 0 first
      component.onStatInput(1, 'toiPerGame', { target: { value: '0:00' } } as unknown as Event);
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      component.onToiKeydown(1, event);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.toiPerGame,
      ).toEqual(0);
    });

    it('should not modify other players on ArrowUp', () => {
      const component = getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        } as ActiveColumns,
      });
      const before = (
        component.playerProjections().find((p) => p.playerId === 2) as SkaterProjection
      ).stats.utility.toiPerGame;
      component.onToiKeydown(1, new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(
        (component.playerProjections().find((p) => p.playerId === 2) as SkaterProjection).stats
          .utility.toiPerGame,
      ).toEqual(before);
    });

    it('should ignore non-arrow keys', () => {
      const component = getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        } as ActiveColumns,
      });
      const before = (
        component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection
      ).stats.utility.toiPerGame;
      component.onToiKeydown(1, new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.toiPerGame,
      ).toEqual(before);
    });
  });

  describe('statWeights updates', () => {
    it('should recompute projections when statWeights changes', () => {
      const component = getComponent({ scoringType: 'points' });
      const firstId =
        component.filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit()[0].playerId;
      const initialPoints = component.playerScores().get(firstId)?.fantasyPoints;

      component.statWeights.update((weights) => ({ ...weights, goals: weights.goals * 2 }));

      const updatedId =
        component.filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit()[0].playerId;
      const updatedPoints = component.playerScores().get(updatedId)?.fantasyPoints;
      expect(updatedPoints).not.toEqual(initialPoints);
    });
  });

  describe('column sorting', () => {
    it('defaults to the summary column, descending', () => {
      const component = getComponent();
      expect(component.sortColumn()).toEqual('summary');
      expect(component.sortDirection()).toEqual('desc');
    });

    it('sorts by an individual stat descending when that column is chosen', () => {
      const component = getComponent();

      component.onSort('hits');

      expect(component.sortColumn()).toEqual('hits');
      expect(component.sortDirection()).toEqual('desc');
      // Draisaitl 51 > McDavid 42 > Hellebuyck (goalie, no hits) 0
      expect(component.visibleProjections().map((p) => p.playerId)).toEqual([2, 1, 3]);
    });

    it('toggles direction when the same column is chosen again', () => {
      const component = getComponent();

      component.onSort('hits');
      component.onSort('hits');

      expect(component.sortDirection()).toEqual('asc');
      expect(component.visibleProjections().map((p) => p.playerId)).toEqual([3, 1, 2]);
    });

    it('resets to descending when switching to a different column', () => {
      const component = getComponent();

      component.onSort('hits');
      component.onSort('hits');
      component.onSort('goals');

      expect(component.sortColumn()).toEqual('goals');
      expect(component.sortDirection()).toEqual('desc');
    });
  });

  describe('search and pagination', () => {
    it('should return all projections when the search term is empty', () => {
      const component = getComponent();
      expect(component.visibleProjections()).toHaveLength(mockPlayers.length);
    });

    it('should filter projections by player name, case-insensitively', () => {
      const component = getComponent();
      component.searchTerm.set('draisaitl');
      expect(component.visibleProjections().map((p) => p.playerId)).toEqual([2]);
    });

    it('should match a substring across multiple players', () => {
      const component = getComponent();
      component.searchTerm.set('connor');
      expect(component.matchingCount()).toEqual(2);
    });

    it('should report no matches for a search that hits nobody', () => {
      const component = getComponent();
      component.searchTerm.set('nobody');
      expect(component.matchingCount()).toEqual(0);
      expect(component.visibleProjections()).toHaveLength(0);
    });

    it('should cap the visible projections at the visible count and expose hasMore', () => {
      const component = getComponent();
      component.visibleCount.set(1);
      expect(component.visibleProjections()).toHaveLength(1);
      expect(component.hasMore()).toEqual(true);
    });

    it('should grow the visible count by one page on showMore', () => {
      const component = getComponent();
      component.visibleCount.set(1);
      component.showMore();
      expect(component.visibleCount()).toEqual(251);
    });

    it('should reset the visible count when the search term changes', () => {
      const component = getComponent();
      component.visibleCount.set(500);
      component.searchTerm.set('connor');
      expect(component.visibleCount()).toEqual(250);
    });

    it('should reset the visible count when the position filter changes', () => {
      const component = getComponent();
      component.visibleCount.set(500);
      component.positionFilter.set('C');
      expect(component.visibleCount()).toEqual(250);
    });
  });

  describe('template', () => {
    it('should render one row per player in the table body', () => {
      getComponent();
      expect(ngMocks.findAll('tbody tr')).toHaveLength(mockPlayers.length);
    });

    it('should render the player name in each body row', () => {
      getComponent();
      const rows = ngMocks.findAll('tbody tr');
      expect(rows[0].nativeElement.textContent).toContain('Connor McDavid');
      expect(rows[1].nativeElement.textContent).toContain('Leon Draisaitl');
    });

    it('should render a column header for each active scoring column', () => {
      getComponent();
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('Goals');
      expect(headers).toContain('Assists');
    });

    it('should show utility column headers for active utility columns', () => {
      getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('GP');
    });

    it('should hide utility columns when activeUtilityColumns is empty', () => {
      getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(),
        } as ActiveColumns,
      });
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).not.toContain('GP');
    });

    it('should show the Total Points column header when scoringType is "points"', () => {
      getComponent({ scoringType: 'points' });
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers.some((h) => h.includes('Total Points'))).toEqual(true);
    });

    it('should hide the Total Points column header when scoringType is "category"', () => {
      getComponent({ scoringType: 'category' });
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers.some((h) => h.includes('Total Points'))).toEqual(false);
    });

    it('should render the weight input row when scoringType is "points"', () => {
      getComponent({ scoringType: 'points' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(1);
    });

    it('should not render the weight input row when scoringType is "category"', () => {
      getComponent({ scoringType: 'category' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(0);
    });

    it('should render the toiPerGame input as type="text" with mm:ss format', () => {
      getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        } as ActiveColumns,
      });
      const toiInput = ngMocks.find('.col-toiPerGame input').nativeElement as HTMLInputElement;
      expect(toiInput.type).toEqual('text');
      expect(toiInput.value).toEqual('22:00');
    });

    it('should render a non-toiPerGame utility input as type="number"', () => {
      getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        } as ActiveColumns,
      });
      const gpInput = ngMocks.find('.col-gp input').nativeElement as HTMLInputElement;
      expect(gpInput.type).toEqual('number');
    });

    it('should have max="100" for shPct input', () => {
      getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['shPct']),
          utility: new Set<SkaterUtilityStatKey>(),
        } as ActiveColumns,
      });
      const shPctInput = ngMocks.find('app-stat-input input').nativeElement as HTMLInputElement;
      expect(shPctInput.getAttribute('max')).toEqual('100');
    });

    it('should have max="100" for svPct input', () => {
      getComponent({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['svPct']),
          utility: new Set<SkaterUtilityStatKey>(),
        } as ActiveColumns,
      });
      const svPctInput = ngMocks.find('app-stat-input input').nativeElement as HTMLInputElement;
      expect(svPctInput.getAttribute('max')).toEqual('100');
    });
  });
});
