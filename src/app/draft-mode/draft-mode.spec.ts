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
    expect(updateProjection).toHaveBeenCalled();
  });

  it('drafts the on-clock pick, removes them from available and advances the clock', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);

    expect(component.roster().slots.find((slot) => slot.playerId === 1)?.slotKey).toEqual('c');
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.filledCount()).toEqual(1);
    expect(component.pickNumber()).toEqual(2);
    expect(component.onClockTeam()?.id).toEqual('team-1');
    expect(component.isMyPick()).toBe(false);
  });

  it('attributes a pick to the on-clock team and undoes the last pick', async () => {
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
});
