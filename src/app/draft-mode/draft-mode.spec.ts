import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { DraftModeComponent } from './draft-mode';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionCalculationService } from '../services/projection-calculation.service';
import { Player } from '../models/player.model';
import { SkaterStats } from '../models/projection.model';
import { ProjectionResponse } from '../api/models/projection-response';

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

  const updateProjection = vi.fn(() => of(projection));

  beforeEach(() => {
    updateProjection.mockClear();
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
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

  it('drafts a player into the roster, removes them from available, and persists', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.available().length).toEqual(2);

    component.draftMine(1);

    expect(component.roster().slots.find((slot) => slot.playerId === 1)?.slotKey).toEqual('c');
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.filledCount()).toEqual(1);
    expect(updateProjection).toHaveBeenCalled();
  });

  it('marks a player taken by others and undoes the pick', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.markTaken(2);
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([1]);
    expect(component.takenCount()).toEqual(1);

    component.undoLast();
    expect(component.available().length).toEqual(2);
    expect(component.takenCount()).toEqual(0);
  });
});
