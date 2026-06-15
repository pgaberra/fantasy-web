import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection';
import { PlayerService } from '../services/player.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { Goalie, Skater } from '../models/player.model';
import { ProjectionResponse } from '../api/models/projection-response';

describe('DraftProjectionComponent', () => {
  const mockSkaters: Skater[] = [
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
  ];
  const mockGoalies: Goalie[] = [];

  const mockProjection: ProjectionResponse = {
    id: 'p1',
    name: 'My league',
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
      },
      players: [
        { playerId: 1, type: 'skater', stats: { utility: { gp: 82 }, scoring: { goals: 64 } } },
      ],
    },
  };

  beforeEach(() =>
    MockBuilder(DraftProjectionComponent)
      .mock(PlayerService, {
        getPlayers: () => of([...mockSkaters, ...mockGoalies]),
      })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(mockProjection),
        updateProjection: () => of(mockProjection),
      })
      .provide({
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
      }),
  );

  it('loads the projection named in the route into edit mode', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.projectionName()).toEqual('My league');
    expect(component.players()).toEqual([...mockSkaters, ...mockGoalies]);
  });

  it('applies the loaded projection settings', () => {
    const component = MockRender(DraftProjectionComponent).point.componentInstance;

    expect(component.scoringType()).toEqual('category');
    expect(component.activeScoringColumns().has('goals')).toEqual(true);
    expect(component.loadedProjections()?.length).toEqual(1);
  });

  it('renames the projection and persists the new name', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.startRename();
    component.renameValue.set('Renamed league');
    component.saveRename();
    await fixture.whenStable();

    expect(updateSpy).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Renamed league' }),
    );
    expect(component.projectionName()).toEqual('Renamed league');
    expect(component.isRenaming()).toEqual(false);
  });

  it('reports a conflict and keeps the old name when the name is taken', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection').mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    component.startRename();
    component.renameValue.set('Taken name');
    component.saveRename();
    await fixture.whenStable();

    expect(component.renameError()).toContain('already exists');
    expect(component.projectionName()).toEqual('My league');
    expect(component.isRenaming()).toEqual(true);
  });

  it('rejects an empty name without calling the API', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.startRename();
    component.renameValue.set('   ');
    component.saveRename();

    expect(component.renameError()).toContain('empty');
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
