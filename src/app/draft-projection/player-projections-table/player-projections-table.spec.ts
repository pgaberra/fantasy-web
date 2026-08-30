import { MockBuilder, MockInstance, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerProjectionsTableComponent } from './player-projections-table';
import { Goalie, Player, Skater } from '../../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../models/stat-key.model';
import { StatInfoService } from '../../services/stat-info.service';
import {
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
import { PlayerService } from '../../services/player.service';
import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { Observable, of } from 'rxjs';

describe('PlayerProjectionsTableComponent', () => {
  const mockPlayers: Player[] = [
    {
      id: 1,
      type: 'skater',
      name: 'Connor McDavid',
      teamAbbrev: 'EDM',
      positions: new Set(['C']),
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: {
          stpg: 0,
          stpa: 0,
          stp: 0,
          hatTricks: 0,
          defPoints: 0,
          shifts: 0,
          toi: 0,
          goals: 64,
          assists: 89,
          points: 153,
          plusMinus: 33,
          pim: 36,
          ppg: 22,
          ppa: 38,
          ppp: 60,
          shg: 1,
          sha: 0,
          shp: 1,
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
      teamAbbrev: 'COL',
      positions: new Set(['C', 'LW']),
      stats: {
        utility: { gp: 80, toiPerGame: 1260 },
        scoring: {
          stpg: 0,
          stpa: 0,
          stp: 0,
          hatTricks: 0,
          defPoints: 0,
          shifts: 0,
          toi: 0,
          goals: 52,
          assists: 76,
          points: 128,
          plusMinus: 18,
          pim: 58,
          ppg: 21,
          ppa: 34,
          ppp: 55,
          shg: 1,
          sha: 2,
          shp: 3,
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
      teamAbbrev: 'WPG',
      stats: {
        utility: { gp: 64 },
        scoring: {
          otl: 0,
          winPct: 0,
          toi: 0,
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
    stpg: 0,
    stpa: 0,
    stp: 0,
    hatTricks: 0,
    defPoints: 0,
    shifts: 0,
    toi: 0,
    otl: 0,
    winPct: 0,
    goals: 4.5,
    assists: 3,
    points: 0,
    sog: 0.5,
    hits: 0.33,
    blocks: 0.5,
    gwg: 0.5,
    pim: 0.5,
    ppg: 0.5,
    ppa: 0.5,
    ppp: 0,
    shg: 0.5,
    sha: 0.5,
    shp: 0,
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
      .keep(StatInfoService)
      .mock(PlayerService),
  );

  const getComponent = (
    overrides: Partial<{
      players: Player[];
      scoringType: ScoringType;
      playerProjections: Projection[];
      statWeights: Record<ScoringStatKey, number>;
      scaleSettings: Record<string, ScaleConfig>;
      useDefaultDecimals: boolean;
      minGoalieGames: number;
      activeScoringColumns: Set<ScoringStatKey>;
      activeUtilityColumns: Set<SkaterUtilityStatKey>;
      columnControls: boolean;
      syncedLeagueName: string | null;
      maxVisiblePlayers: number | null;
    }> = {},
  ) =>
    MockRender(PlayerProjectionsTableComponent, {
      players: mockPlayers,
      scoringType: 'category',
      playerProjections: mockPlayerProjections,
      statWeights: mockStatWeights,
      activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
      scaleSettings: mockScaleSettings,
      useDefaultDecimals: true,
      ...overrides,
    }).point.componentInstance;

  /**
   * Rookie status is a decoration the server may not be able to supply — it comes from a
   * service production runs with switched off. Null has to read as "no marker", never as
   * "nobody is a rookie".
   */
  describe('rookies', () => {
    // MockInstance rather than stubbing the injected service: ng-mocks needs the answer in
    // place before the component is built, and reaching into TestBed first breaks MockRender.
    MockInstance.scope();

    /** The resource resolves asynchronously, so the answer is only there once it settles. */
    const renderWithRookies = async (rookies: Observable<Set<number> | null>) => {
      MockInstance(PlayerService, 'getRookieIds', () => rookies);
      const component = getComponent();
      await TestBed.inject(ApplicationRef).whenStable();
      return component;
    };

    it('marks the rookies and offers the filter', async () => {
      const component = await renderWithRookies(of(new Set([1])));

      expect(component.isRookie(1)).toEqual(true);
      expect(component.isRookie(2)).toEqual(false);
      expect(component.rookiesAvailable()).toEqual(true);
    });

    it('narrows the table to the rookies when the filter is on', async () => {
      const component = await renderWithRookies(of(new Set([1])));

      component.rookiesOnly.set(true);

      expect(component.visibleProjections().map((sp) => sp.projection.playerId)).toEqual([1]);
    });

    it('offers no filter when the server could not say who is a rookie', async () => {
      const component = await renderWithRookies(of(null));

      expect(component.rookiesAvailable()).toEqual(false);
      expect(component.isRookie(1)).toEqual(false);
    });

    // Nobody being a rookie is a real answer, but there is nothing to filter to.
    it('offers no filter when nobody in the pool is a rookie', async () => {
      const component = await renderWithRookies(of(new Set([999])));

      expect(component.rookiesAvailable()).toEqual(false);
    });

    it('shows every player while the filter is on but the answer is unknown', async () => {
      const component = await renderWithRookies(of(null));

      component.rookiesOnly.set(true);

      expect(component.visibleProjections().length).toEqual(mockPlayerProjections.length);
    });
  });

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
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
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
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
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
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
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
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
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
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
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
        component.filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit()[0].projection
          .playerId;
      const initialPoints = component
        .scoredProjections()
        .find((sp) => sp.projection.playerId === firstId)?.score.fantasyPoints;

      component.statWeights.update((weights) => ({ ...weights, goals: weights.goals * 2 }));

      const updatedId =
        component.filteredAndSortedPlayerProjectionsExcludingCurrentPlayerEdit()[0].projection
          .playerId;
      const updatedPoints = component
        .scoredProjections()
        .find((sp) => sp.projection.playerId === updatedId)?.score.fantasyPoints;
      expect(updatedPoints).not.toEqual(initialPoints);
    });
  });

  describe('loading a saved projection', () => {
    it('drops saved entries whose player is no longer in the roster', () => {
      const missing: Projection = { ...mockPlayerProjections[0], playerId: 999 };
      const fixture = MockRender(PlayerProjectionsTableComponent, {
        players: mockPlayers,
        scoringType: 'category',
        initialProjections: [mockPlayerProjections[0], missing],
        statWeights: mockStatWeights,
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        scaleSettings: mockScaleSettings,
        useDefaultDecimals: true,
      });

      const ids = fixture.point.componentInstance.playerProjections().map((pp) => pp.playerId);
      expect(ids).toEqual([1]);
    });

    it('counts what it dropped so the user can be told', () => {
      const missing: Projection = { ...mockPlayerProjections[0], playerId: 999 };
      const fixture = MockRender(PlayerProjectionsTableComponent, {
        players: mockPlayers,
        scoringType: 'category',
        initialProjections: [mockPlayerProjections[0], missing],
        statWeights: mockStatWeights,
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        scaleSettings: mockScaleSettings,
        useDefaultDecimals: true,
      });

      expect(fixture.point.componentInstance.droppedPlayerCount()).toEqual(1);
    });

    /**
     * An empty pool means the read model did not arrive, not that the league emptied. Filtering
     * against it would discard every row of a saved projection.
     */
    it('keeps every row when there is no player pool to check against', () => {
      const fixture = MockRender(PlayerProjectionsTableComponent, {
        players: [],
        scoringType: 'category',
        initialProjections: mockPlayerProjections,
        statWeights: mockStatWeights,
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        scaleSettings: mockScaleSettings,
        useDefaultDecimals: true,
      });

      const component = fixture.point.componentInstance;
      expect(component.playerProjections()).toEqual(mockPlayerProjections);
      expect(component.droppedPlayerCount()).toEqual(0);
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
      expect(component.visibleProjections().map((sp) => sp.projection.playerId)).toEqual([2, 1, 3]);
    });

    it('toggles direction when the same column is chosen again', () => {
      const component = getComponent();

      component.onSort('hits');
      component.onSort('hits');

      expect(component.sortDirection()).toEqual('asc');
      // McDavid 42 then Draisaitl 51, and Hellebuyck last: a goalie has no hits at all, which is
      // not the lowest hit total, so he stays at the bottom rather than heading the ascending sort.
      expect(component.visibleProjections().map((sp) => sp.projection.playerId)).toEqual([1, 2, 3]);
    });

    it('resets to descending when switching to a different column', () => {
      const component = getComponent();

      component.onSort('hits');
      component.onSort('hits');
      component.onSort('goals');

      expect(component.sortColumn()).toEqual('goals');
      expect(component.sortDirection()).toEqual('desc');
    });

    it('opens a lower-is-better stat at its good end instead of its bad one', () => {
      const component = getComponent();

      component.onSort('gaa');

      expect(component.sortDirection()).toEqual('asc');
    });

    it('still flips a lower-is-better stat on a second click', () => {
      const component = getComponent();

      component.onSort('gaa');
      component.onSort('gaa');

      expect(component.sortDirection()).toEqual('desc');
    });

    it('sorts players alphabetically when their column is chosen', () => {
      const component = getComponent();

      component.onSort('name');

      expect(component.sortDirection()).toEqual('asc');
    });
  });

  describe('goalie minimum games', () => {
    const lowGpGoalie: Player = {
      id: 4,
      type: 'goalie',
      name: 'Tiny Sample',
      teamAbbrev: 'NYR',
      stats: {
        utility: { gp: 3 },
        scoring: {
          otl: 0,
          winPct: 0,
          toi: 0,
          gs: 3,
          w: 3,
          l: 0,
          sho: 1,
          sa: 90,
          sv: 89,
          ga: 1,
          gaa: 0.5,
          svPct: 0.989,
        },
      },
    };
    const lowGpProjection: Projection = {
      type: 'goalie',
      playerId: 4,
      stats: {
        scoring: lowGpGoalie.stats.scoring,
        utility: lowGpGoalie.stats.utility,
      },
    };
    const ratingScoringColumns = new Set<ScoringStatKey>(['w', 'gaa', 'svPct']);
    const ratingUtilityColumns = new Set<SkaterUtilityStatKey>(['gp']);

    it('ranks a goalie below the minimum games last in the summary sort', () => {
      const component = getComponent({
        players: [...mockPlayers, lowGpGoalie],
        playerProjections: [...mockPlayerProjections, lowGpProjection],
        activeScoringColumns: ratingScoringColumns,
        activeUtilityColumns: ratingUtilityColumns,
        minGoalieGames: 30,
      });

      const order = component.visibleProjections().map((sp) => sp.projection.playerId);
      expect(order[order.length - 1]).toEqual(4);
      expect(
        component.scoredProjections().find((sp) => sp.projection.playerId === 4)?.qualified,
      ).toEqual(false);
    });

    it('keeps the goalie qualified when its games meet the threshold', () => {
      const component = getComponent({
        players: [...mockPlayers, lowGpGoalie],
        playerProjections: [...mockPlayerProjections, lowGpProjection],
        activeScoringColumns: ratingScoringColumns,
        activeUtilityColumns: ratingUtilityColumns,
        minGoalieGames: 2,
      });

      expect(
        component.scoredProjections().find((sp) => sp.projection.playerId === 4)?.qualified,
      ).toEqual(true);
    });

    it('never disqualifies goalies in a points league', () => {
      const component = getComponent({
        players: [...mockPlayers, lowGpGoalie],
        playerProjections: [...mockPlayerProjections, lowGpProjection],
        scoringType: 'points',
        minGoalieGames: 30,
      });

      expect(
        component.scoredProjections().find((sp) => sp.projection.playerId === 4)?.qualified,
      ).toEqual(true);
    });
  });

  describe('Z-Score consistency with displayed values (#91)', () => {
    const makeGoalie = (id: number, name: string, team: string, wins: number): Goalie => ({
      id,
      type: 'goalie',
      name,
      teamAbbrev: team,
      stats: {
        utility: { gp: 60 },
        scoring: {
          otl: 0,
          winPct: 0,
          toi: 0,
          gs: 60,
          w: wins,
          l: 20,
          sho: 3,
          sa: 1700,
          sv: 1550,
          ga: 150,
          gaa: 2.6,
          svPct: 0.91,
        },
      },
    });
    const toProjection = (g: Goalie): Projection => ({
      type: 'goalie',
      playerId: g.id,
      stats: {
        scoring: {
          ...g.stats.scoring,
        },
        utility: { ...g.stats.utility },
      },
    });

    it('keeps a goalie zScore stable when a stat changes below the displayed precision', () => {
      const goalies = [
        makeGoalie(10, 'Top G', 'AAA', 35),
        makeGoalie(11, 'Mid G', 'BBB', 30),
        makeGoalie(12, 'Low G', 'CCC', 25),
      ];
      const component = getComponent({
        players: goalies,
        playerProjections: goalies.map(toProjection),
        scoringType: 'category',
        activeScoringColumns: new Set<ScoringStatKey>(['w']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
      });

      const zScoreOf = (id: number) =>
        component.scoredProjections().find((sp) => sp.projection.playerId === id)!.score.zScore;
      const before = zScoreOf(10);

      // Wins shows 0 decimals, so a raw 35 -> 35.4 nudge leaves the displayed value at 35.
      component.playerProjections.update((ps) =>
        ps.map((p) =>
          p.playerId === 10 && p.type === 'goalie'
            ? {
                ...p,
                stats: {
                  ...p.stats,
                  scoring: {
                    ...p.stats.scoring,
                    w: 35.4,
                  },
                },
              }
            : p,
        ),
      );

      expect(zScoreOf(10)).toEqual(before);
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
      expect(component.visibleProjections().map((sp) => sp.projection.playerId)).toEqual([2]);
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

    it('should expose the available teams sorted alphabetically', () => {
      const component = getComponent();
      expect(component.availableTeams()).toEqual(['COL', 'EDM', 'WPG']);
    });

    it('should filter projections by team', () => {
      const component = getComponent();
      component.teamFilter.set('EDM');
      expect(component.visibleProjections().map((sp) => sp.projection.playerId)).toEqual([1]);
    });

    it('should sort projections alphabetically by player name', () => {
      const component = getComponent();
      component.onSort('name');
      component.sortDirection.set('asc');
      expect(component.visibleProjections().map((sp) => sp.projection.playerId)).toEqual([3, 1, 2]);
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

    it('should cap the visible projections at maxVisiblePlayers', () => {
      const component = getComponent({ maxVisiblePlayers: 2 });
      expect(component.visibleCount()).toEqual(2);
      expect(component.visibleProjections()).toHaveLength(2);
    });

    // The rest of the list is behind an account, so offering to page into it would be a lie.
    it('should never report more to show when capped, even with players left over', () => {
      const component = getComponent({ maxVisiblePlayers: 2 });
      expect(component.matchingCount()).toBeGreaterThan(2);
      expect(component.hasMore()).toEqual(false);
    });

    it('should reset back to the cap, not a full page, when the search term changes', () => {
      const component = getComponent({ maxVisiblePlayers: 2 });
      component.visibleCount.set(500);
      component.searchTerm.set('connor');
      expect(component.visibleCount()).toEqual(2);
    });
  });

  describe('template', () => {
    it('should not offer a Show more button when the row count is capped', () => {
      getComponent({ maxVisiblePlayers: 2 });
      expect(ngMocks.findAll('.table-footer button')).toHaveLength(0);
    });

    it('should render one row per player in the table body', () => {
      getComponent();
      expect(ngMocks.findAll('tbody tr')).toHaveLength(mockPlayers.length);
    });

    it('should render the player name in each body row', () => {
      getComponent();
      const tableText = ngMocks.find('tbody').nativeElement.textContent;
      expect(tableText).toContain('Connor McDavid');
      expect(tableText).toContain('Leon Draisaitl');
    });

    it('should render a column header for each active scoring column', () => {
      getComponent();
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('Goals');
      expect(headers).toContain('Assists');
    });

    it('should show utility column headers for active utility columns', () => {
      getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
      });
      const headers = ngMocks.findAll('thead th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('GP');
    });

    it('should hide utility columns when activeUtilityColumns is empty', () => {
      getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(),
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
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
      });
      const toiInput = ngMocks.find('.col-toiPerGame input').nativeElement as HTMLInputElement;
      expect(toiInput.type).toEqual('text');
      expect(toiInput.value).toEqual('22:00');
    });

    it('should render a non-toiPerGame utility input as type="number"', () => {
      getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
      });
      const gpInput = ngMocks.find('.col-gp input').nativeElement as HTMLInputElement;
      expect(gpInput.type).toEqual('number');
    });

    it('should have max="100" for shPct input', () => {
      getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['shPct']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(),
      });
      const shPctInput = ngMocks.find('app-stat-input input').nativeElement as HTMLInputElement;
      expect(shPctInput.getAttribute('max')).toEqual('100');
    });

    it('should have max="100" for svPct input', () => {
      getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['svPct']),
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(),
      });
      const svPctInput = ngMocks.find('app-stat-input input').nativeElement as HTMLInputElement;
      expect(svPctInput.getAttribute('max')).toEqual('100');
    });
  });

  describe('applyFullSeasonGames', () => {
    it('sets skaters to 84 games and scales goalies proportionally', () => {
      const component = getComponent();
      component.applyFullSeasonGames(true, 0);
      const projections = component.playerProjections();
      expect(
        (projections.find((p) => p.playerId === 1) as SkaterProjection).stats.utility.gp,
      ).toEqual(84);
      expect(
        (projections.find((p) => p.playerId === 2) as SkaterProjection).stats.utility.gp,
      ).toEqual(84);
      // Goalie gp 64 -> round(64 * 84 / 82) = 66
      expect(
        (projections.find((p) => p.playerId === 3) as GoalieProjection).stats.utility.gp,
      ).toEqual(66);
    });
  });

  describe('header layout', () => {
    it('keeps the title beside the controls while there is no league toolbar', () => {
      getComponent();
      expect(ngMocks.findAll('.table-header--stacked')).toHaveLength(0);
      expect(ngMocks.findAll('.league-controls')).toHaveLength(0);
    });

    it('leaves saying which league to the page, not a dot on League setup', () => {
      // The toolbar's own action names the league in words; a dot here would be the same fact
      // twice, an inch apart.
      getComponent({ columnControls: true, syncedLeagueName: 'Puck Luck Dynasty' });

      expect(ngMocks.findAll('.league-setup-btn')).toHaveLength(1);
      expect(ngMocks.findAll('.league-setup-btn .sync-dot')).toHaveLength(0);
    });

    it('does not offer League setup in a points league with nothing behind it', () => {
      // Its scoring is the weight row in the header; the menu would open on an empty popover.
      getComponent({ columnControls: true, scoringType: 'points', syncedLeagueName: null });
      expect(ngMocks.findAll('.league-setup-btn')).toHaveLength(0);
    });

    it('offers it in a points league that has a league to re-sync', () => {
      getComponent({
        columnControls: true,
        scoringType: 'points',
        syncedLeagueName: 'Puck Luck Dynasty',
      });
      expect(ngMocks.findAll('.league-setup-btn')).toHaveLength(1);
    });

    it('offers it in a category league, which ranks by the settings it holds', () => {
      getComponent({ columnControls: true, scoringType: 'category', syncedLeagueName: null });
      expect(ngMocks.findAll('.league-setup-btn')).toHaveLength(1);
    });

    it('keeps picking stats in the toolbar rather than in a scrolled-away column', () => {
      getComponent({ columnControls: true });
      expect(ngMocks.findAll('.col-add')).toHaveLength(0);
      const toolbarButtons = ngMocks
        .findAll('.league-controls .btn')
        .map((button) => button.nativeElement.textContent.trim());
      // Named for what it decides — which stats the projection scores — not for the column each
      // one happens to occupy.
      expect(toolbarButtons.some((label) => label.includes('Stats'))).toEqual(true);
    });

    it('groups the stat picker with the league settings, not with the filters', () => {
      // Which stats are active is what the projection is scored on — the same kind of decision as
      // points-or-category and the league setup, not a way of narrowing what is on screen.
      getComponent({ columnControls: true });

      expect(
        ngMocks
          .findAll('.filter-controls .btn')
          .some((button) => button.nativeElement.textContent.includes('Stats')),
      ).toEqual(false);
    });

    it('stacks the title above the toolbar once the league controls are there', () => {
      // Side by side, the toolbar squeezes the heading onto two lines even on a wide screen.
      getComponent({ columnControls: true });
      expect(ngMocks.findAll('.table-header--stacked')).toHaveLength(1);
      expect(ngMocks.findAll('.league-controls')).toHaveLength(1);
    });
  });

  describe('picking columns', () => {
    it('ticks the box before the table has been rescored', () => {
      // Rescoring the pool and rebuilding every row is a few hundred milliseconds, and Angular
      // would spend them before painting the tick. The menu answers the click straight away and
      // the columns follow.
      const component = getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      });

      component.toggleScoringColumn('goals');

      expect([...component.shownScoringColumns()]).toEqual(['assists']);
      expect([...component.activeScoringColumns()]).toEqual(['goals', 'assists']);

      component.flushColumnToggles();
      expect([...component.activeScoringColumns()]).toEqual(['assists']);
    });

    it('rescores once for several stats ticked in a row', () => {
      const component = getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals']),
      });

      component.toggleScoringColumn('assists');
      component.toggleScoringColumn('hits');
      expect([...component.shownScoringColumns()]).toEqual(['goals', 'assists', 'hits']);

      component.flushColumnToggles();
      expect([...component.activeScoringColumns()]).toEqual(['goals', 'assists', 'hits']);
      // Each tick is still its own undo step — batching is about the work, not about the history.
      component.undo();
      expect([...component.activeScoringColumns()]).toEqual(['goals', 'assists']);
    });

    it('follows a column change made anywhere else, such as an undo', () => {
      const component = getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      });

      component.toggleScoringColumn('goals');
      component.undo();

      expect([...component.shownScoringColumns()]).toEqual(['goals', 'assists']);
    });
  });

  describe('undo/redo', () => {
    const goalsOf = (component: PlayerProjectionsTableComponent, playerId: number) =>
      (component.playerProjections().find((p) => p.playerId === playerId) as SkaterProjection).stats
        .scoring.goals;
    const setStat = (
      component: PlayerProjectionsTableComponent,
      playerId: number,
      key: string,
      raw: string,
    ) =>
      component.onStatInput(playerId, key as never, { target: { value: raw } } as unknown as Event);

    it('starts with no history', () => {
      const component = getComponent();
      expect(component.canUndo()).toEqual(false);
      expect(component.canRedo()).toEqual(false);
    });

    it('undo brings back a column removed from its header menu', () => {
      const component = getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      });

      component.toggleScoringColumn('goals');
      component.flushColumnToggles();
      expect([...component.activeScoringColumns()]).toEqual(['assists']);
      expect(component.canUndo()).toEqual(true);

      component.undo();
      expect([...component.activeScoringColumns()]).toEqual(['goals', 'assists']);
      expect(component.canRedo()).toEqual(true);

      component.redo();
      expect([...component.activeScoringColumns()]).toEqual(['assists']);
    });

    it('undo brings back a removed utility column', () => {
      const component = getComponent({
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
      });

      component.toggleUtilityColumn('gp');
      component.flushColumnToggles();
      expect([...component.activeUtilityColumns()]).toEqual([]);

      component.undo();
      expect([...component.activeUtilityColumns()]).toEqual(['gp']);
    });

    it('keeps a stat edit and a column removal as separate undo steps', () => {
      const component = getComponent({
        activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      });
      const original = goalsOf(component, 1);

      setStat(component, 1, 'goals', '70');
      component.toggleScoringColumn('assists');

      component.undo();
      expect([...component.activeScoringColumns()]).toEqual(['goals', 'assists']);
      expect(goalsOf(component, 1)).toEqual(70);

      component.undo();
      expect(goalsOf(component, 1)).toEqual(original);
    });

    it('undo restores the value the cell had before the edit and enables redo', () => {
      const component = getComponent();
      const original = goalsOf(component, 1);

      setStat(component, 1, 'goals', '70');
      expect(goalsOf(component, 1)).toEqual(70);
      expect(component.canUndo()).toEqual(true);

      component.undo();
      expect(goalsOf(component, 1)).toEqual(original);
      expect(component.canUndo()).toEqual(false);
      expect(component.canRedo()).toEqual(true);
    });

    it('coalesces consecutive edits to the same cell into one undo step', () => {
      const component = getComponent();
      const original = goalsOf(component, 1);

      // Simulates typing "7" then "70" into the same cell without leaving it.
      setStat(component, 1, 'goals', '7');
      setStat(component, 1, 'goals', '70');
      expect(goalsOf(component, 1)).toEqual(70);

      component.undo();
      expect(goalsOf(component, 1)).toEqual(original);
      expect(component.canUndo()).toEqual(false);
    });

    it('keeps edits to different cells as separate undo steps', () => {
      const component = getComponent();
      const originalGoals = goalsOf(component, 1);

      setStat(component, 1, 'goals', '70');
      setStat(component, 1, 'assists', '90');

      component.undo();
      expect(goalsOf(component, 1)).toEqual(70);
      component.undo();
      expect(goalsOf(component, 1)).toEqual(originalGoals);
    });

    it('starts a new undo step for the same cell after focus leaves the row', () => {
      const component = getComponent();
      const original = goalsOf(component, 1);

      setStat(component, 1, 'goals', '70');
      component.onRowFocusOut({ relatedTarget: null } as unknown as FocusEvent);
      setStat(component, 1, 'goals', '75');

      component.undo();
      expect(goalsOf(component, 1)).toEqual(70);
      component.undo();
      expect(goalsOf(component, 1)).toEqual(original);
    });

    it('redo re-applies an undone edit', () => {
      const component = getComponent();

      setStat(component, 1, 'goals', '70');
      component.undo();
      component.redo();

      expect(goalsOf(component, 1)).toEqual(70);
      expect(component.canRedo()).toEqual(false);
    });

    it('clears the redo stack when a new edit is made after an undo', () => {
      const component = getComponent();

      setStat(component, 1, 'goals', '70');
      component.undo();
      expect(component.canRedo()).toEqual(true);

      setStat(component, 1, 'assists', '90');
      expect(component.canRedo()).toEqual(false);
    });

    it('records a Full season bulk edit as its own undo step', () => {
      const component = getComponent();

      setStat(component, 1, 'goals', '70');
      component.applyFullSeasonGames(true, 0);
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.gp,
      ).toEqual(84);

      component.undo();
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .utility.gp,
      ).toEqual(82);
      expect(goalsOf(component, 1)).toEqual(70);
    });

    it('undo and redo are no-ops when their stacks are empty', () => {
      const component = getComponent();
      const original = goalsOf(component, 1);

      component.undo();
      component.redo();

      expect(goalsOf(component, 1)).toEqual(original);
      expect(component.canUndo()).toEqual(false);
      expect(component.canRedo()).toEqual(false);
    });
  });

  describe('onHistoryKeydown', () => {
    const dispatch = (
      component: PlayerProjectionsTableComponent,
      init: KeyboardEventInit,
      target?: EventTarget,
    ) => {
      const event = new KeyboardEvent('keydown', init);
      if (target) {
        Object.defineProperty(event, 'target', { value: target });
      }
      vi.spyOn(event, 'preventDefault');
      component.onHistoryKeydown(event);
      return event;
    };

    it('undoes on Ctrl+Z', () => {
      const component = getComponent();
      component.onStatInput(1, 'goals', { target: { value: '70' } } as unknown as Event);

      const event = dispatch(component, { key: 'z', ctrlKey: true });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(64);
    });

    it('redoes on Ctrl+Shift+Z', () => {
      const component = getComponent();
      component.onStatInput(1, 'goals', { target: { value: '70' } } as unknown as Event);
      component.undo();

      dispatch(component, { key: 'z', ctrlKey: true, shiftKey: true });

      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(70);
    });

    it('redoes on Ctrl+Y', () => {
      const component = getComponent();
      component.onStatInput(1, 'goals', { target: { value: '70' } } as unknown as Event);
      component.undo();

      dispatch(component, { key: 'y', ctrlKey: true });

      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(70);
    });

    it('ignores the shortcut without a ctrl/meta modifier', () => {
      const component = getComponent();
      component.onStatInput(1, 'goals', { target: { value: '70' } } as unknown as Event);

      dispatch(component, { key: 'z' });

      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(70);
    });

    it('leaves native undo alone in a non-stat input field', () => {
      const component = getComponent();
      component.onStatInput(1, 'goals', { target: { value: '70' } } as unknown as Event);
      const renameInput = document.createElement('input');

      const event = dispatch(component, { key: 'z', ctrlKey: true }, renameInput);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(
        (component.playerProjections().find((p) => p.playerId === 1) as SkaterProjection).stats
          .scoring.goals,
      ).toEqual(70);
    });
  });
});
