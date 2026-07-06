import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { DraftModeComponent } from './draft-mode';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionCalculationService } from '../services/projection-calculation.service';
import { PositionFilterService } from '../services/position-filter.service';
import { Player } from '../models/player.model';
import { SkaterStats } from '../models/projection.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { DraftState } from '../api/models/draft-state';

describe('DraftModeComponent', () => {
  const players: Player[] = [
    { id: 1, type: 'skater', name: 'McDavid', positions: new Set(['C']), stats: {} as SkaterStats },
    { id: 2, type: 'skater', name: 'Makar', positions: new Set(['D']), stats: {} as SkaterStats },
  ];

  const projection: ProjectionResponse = {
    id: 'p1',
    name: 'My Projection',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: {
      settings: {
        scoringType: 'category',
        statWeights: { goals: 5 },
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0 },
        useDefaultDecimals: false,
        leagueSize: 12,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
        minGoalieGames: 25,
      },
      players: [
        { playerId: 1, type: 'skater', stats: { utility: { gp: 82 }, scoring: { goals: 60 } } },
        { playerId: 2, type: 'skater', stats: { utility: { gp: 82 }, scoring: { goals: 20 } } },
      ],
    },
  };

  const draft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
  };

  const updateProjection = vi.fn(() => of(projection));

  beforeEach(() => {
    updateProjection.mockClear();
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(projection),
        updateProjection,
      })
      .provide({
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
      });
  });

  it('starts in setup when the projection has no draft', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.phase()).toEqual('setup');
  });

  it('applies a setup, enters the draft phase and persists', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applySetup(draft);

    expect(component.phase()).toEqual('draft');
    expect(component.isMyPick()).toBe(true);
    expect(component.draftLabel()).toEqual('Draft');
    expect(updateProjection).toHaveBeenCalled();
  });

  it('applies the roster slots chosen in setup', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.onSetupConfirmed({
      draft,
      rosterSlots: { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
    });

    expect(component.rosterSlots()).toEqual({ c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 });
    expect(component.totalSlots()).toEqual(1);
    expect(component.phase()).toEqual('draft');
  });

  it('applies a Yahoo sync to the settings and records it', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    updateProjection.mockClear();

    component.applyYahooSync({
      leagueName: 'My Yahoo League',
      leagueKey: 'nhl.l.123',
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals', 'assists'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 },
        leagueSize: 10,
        statWeights: { goals: 1 },
        unsupportedRosterCodes: [],
        unsupportedStats: [],
      },
    });

    expect(component.rosterSlots()).toEqual({ c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 });
    expect(component.yahooSync()).toEqual({
      leagueName: 'My Yahoo League',
      leagueKey: 'nhl.l.123',
      syncedAt: expect.any(String),
    });
    expect(updateProjection).toHaveBeenCalled();
  });

  it('ranks teams by projected total in the standings', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    const standings = component.standings();
    expect(standings.map((entry) => entry.team.id)).toEqual(['team-me', 'team-1']);
    expect(standings[0].players.map((player) => player.playerId)).toEqual([1]);
    expect(standings[0].total).toBeGreaterThan(standings[1].total);
  });

  it('confirms before finishing, then toggles the summary view', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.requestFinishDraft();
    expect(component.confirmingFinish()).toBe(true);
    expect(component.showSummary()).toBe(false);

    component.cancelFinish();
    expect(component.confirmingFinish()).toBe(false);
    expect(component.showSummary()).toBe(false);

    component.requestFinishDraft();
    component.finishDraft();
    expect(component.confirmingFinish()).toBe(false);
    expect(component.showSummary()).toBe(true);

    component.backToDraft();
    expect(component.showSummary()).toBe(false);
  });

  it('drafts the next pick, removes them from available and advances the order', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);

    expect(component.roster().slots.find((slot) => slot.playerId === 1)?.slotKey).toEqual('c');
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.filledCount()).toEqual(1);
    expect(component.pickNumber()).toEqual(2);
    expect(component.upNextTeam()?.id).toEqual('team-1');
    expect(component.isMyPick()).toBe(false);
    expect(component.draftLabel()).toEqual('Draft for Team 1');
  });

  it('attributes a pick to the next team and undoes the last pick', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    expect(component.available().length).toEqual(0);
    expect(component.filledCount()).toEqual(1);
    expect(component.roster().slots.find((slot) => slot.playerId === 2)).toBeUndefined();

    component.undoLast();

    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.pickNumber()).toEqual(2);
  });

  it('shows another team roster when a different team is selected', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    expect(component.roster().slots.find((slot) => slot.playerId === 1)).toBeDefined();
    expect(component.roster().slots.find((slot) => slot.playerId === 2)).toBeUndefined();

    component.viewedTeamId.set('team-1');

    expect(component.effectiveTeamId()).toEqual('team-1');
    expect(component.roster().slots.find((slot) => slot.playerId === 2)).toBeDefined();
    expect(component.roster().slots.find((slot) => slot.playerId === 1)).toBeUndefined();
  });

  it('groups picks into rounds, newest round and pick first', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    const rounds = component.pickRounds();
    expect(rounds.map((round) => round.round)).toEqual([2, 1]);
    expect(rounds[0].picks.map((entry) => entry.overall)).toEqual([3]);
    expect(rounds[1].picks.map((entry) => entry.overall)).toEqual([2, 1]);
    expect(rounds[1].picks[0].mine).toBe(false);
    expect(rounds[1].picks[1].mine).toBe(true);
  });

  it('replaces a player at a specific pick and frees the old one', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    component.startEditPick(1);
    component.replacePick(99);

    expect(component.picks()[0]).toEqual({ playerId: 99, teamId: 'team-me' });
    expect(component.picks()[1]).toEqual({ playerId: 2, teamId: 'team-1' });
    expect(component.editingPick()).toBeNull();
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([1]);
  });

  it('removes a pick and shifts later picks up, re-attributing by position', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    component.removePick(1);

    expect(component.picks()).toEqual([
      { playerId: 2, teamId: 'team-me' },
      { playerId: 3, teamId: 'team-1' },
    ]);
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([1]);
  });

  it('asks before removing an earlier pick and lists the shifts', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    component.requestRemovePick(1);

    expect(component.pendingRemoval()).toEqual(1);
    expect(component.picks().length).toEqual(3);
    const preview = component.removalPreview();
    expect(preview?.changes.length).toEqual(2);
    expect(preview?.changes[0].playerId).toEqual(2);
    expect(preview?.changes[0].oldOverall).toEqual(2);
    expect(preview?.changes[0].newOverall).toEqual(1);
    expect(preview?.changes[0].oldTeamName).toEqual('Team 1');
    expect(preview?.changes[0].newTeamName).toEqual('My Team');
    expect(preview?.changes[0].affectsMine).toBe(true);
    expect(preview?.changes[1].affectsMine).toBe(false);

    component.confirmRemovePick();

    expect(component.pendingRemoval()).toBeNull();
    expect(component.picks()).toEqual([
      { playerId: 2, teamId: 'team-me' },
      { playerId: 3, teamId: 'team-1' },
    ]);
  });

  it('removes the last pick directly without confirmation', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    component.requestRemovePick(3);

    expect(component.pendingRemoval()).toBeNull();
    expect(component.picks().length).toEqual(2);
  });

  it('defaults the roster view to my team even when I am not first in the order', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup({
      teams: [
        { id: 'team-1', name: 'Team 1', mine: false },
        { id: 'team-me', name: 'My Team', mine: true },
      ],
      order: ['team-1', 'team-me'],
      picks: [],
    });
    fixture.detectChanges();

    expect(component.effectiveTeamId()).toEqual('team-me');
  });
});

describe('DraftModeComponent — available pagination', () => {
  const manyPlayers: Player[] = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    type: 'skater',
    name: `Player ${i + 1}`,
    positions: new Set(['C']),
    stats: {} as SkaterStats,
  }));

  const bigProjection: ProjectionResponse = {
    id: 'p2',
    name: 'Big Board',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: {
      settings: {
        scoringType: 'category',
        statWeights: { goals: 5 },
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0 },
        useDefaultDecimals: false,
        leagueSize: 12,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
        minGoalieGames: 25,
      },
      players: manyPlayers.map((player, i) => ({
        playerId: player.id,
        type: 'skater' as const,
        stats: { utility: { gp: 82 }, scoring: { goals: 120 - i } },
      })),
    },
  };

  const draft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
  };

  beforeEach(() =>
    MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .mock(PlayerService, { getPlayers: () => of(manyPlayers) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(bigProjection),
        updateProjection: vi.fn(() => of(bigProjection)),
      })
      .provide({
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p2' } } },
      }),
  );

  it('defaults to 100 players per page and reveals more on show more', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    expect(component.available().length).toEqual(120);
    expect(component.pageSize()).toEqual(100);
    expect(component.visibleAvailable().length).toEqual(100);
    expect(component.hasMoreAvailable()).toBe(true);

    component.showMore();

    expect(component.visibleAvailable().length).toEqual(120);
    expect(component.hasMoreAvailable()).toBe(false);
  });

  it('resets to the first page when the position filter changes', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);
    component.showMore();
    expect(component.visibleAvailable().length).toEqual(120);

    component.setPositionFilter('C');

    expect(component.visibleAvailable().length).toEqual(100);
  });

  it('honors a user-chosen page size', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.pageSize.set(200);
    expect(component.visibleAvailable().length).toEqual(120);
    expect(component.hasMoreAvailable()).toBe(false);

    component.pageSize.set(100);
    expect(component.visibleAvailable().length).toEqual(100);
    expect(component.hasMoreAvailable()).toBe(true);
  });
});
