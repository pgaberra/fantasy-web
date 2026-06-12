import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { ProjectionCreateComponent } from './projection-create';
import { PlayerService } from '../services/player.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { StatInfoService } from '../services/stat-info.service';
import { Skater } from '../models/player.model';
import { SkaterScoringStats } from '../models/projection.model';
import { SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { ProjectionResponse } from '../api/models/projection-response';

describe('ProjectionCreateComponent', () => {
  const skater: Skater = {
    id: 1,
    type: 'skater',
    name: 'Connor McDavid',
    positions: new Set(['C']),
    stats: {
      utility: { gp: 82, toiPerGame: 1320 },
      scoring: Object.fromEntries(
        SKATER_SCORING_STAT_KEYS.map((key) => [key, 1]),
      ) as SkaterScoringStats,
    },
  };

  const created: ProjectionResponse = {
    id: 'new-id',
    name: 'Dynasty',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: { settings: {} as never, players: [] },
  };

  const navigate = vi.fn();
  const createProjection = vi.fn(() => of(created));

  beforeEach(() => {
    navigate.mockClear();
    createProjection.mockClear();
    return MockBuilder(ProjectionCreateComponent)
      .keep(StatInfoService)
      .mock(PlayerService, { getSkaters: () => of([skater]), getGoalies: () => of([]) })
      .mock(ProjectionStorageService, { listProjections: () => of([]), createProjection })
      .provide({ provide: Router, useValue: { navigate } });
  });

  const getComponent = () => MockRender(ProjectionCreateComponent).point.componentInstance;

  it('loads players and existing projections', () => {
    const component = getComponent();
    expect(component.isLoading()).toEqual(false);
  });

  it('requires a name before it can create', () => {
    const component = getComponent();
    expect(component.canCreate()).toEqual(false);
    component.name.set('Dynasty');
    expect(component.canCreate()).toEqual(true);
  });

  it('creates a projection and navigates to edit mode', () => {
    const component = getComponent();
    component.name.set('Dynasty');
    component.create();
    expect(createProjection).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new-id']);
  });
});
