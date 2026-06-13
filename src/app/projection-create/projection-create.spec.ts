import { MockBuilder, MockInstance, MockRender } from 'ng-mocks';
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
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

describe('ProjectionCreateComponent', () => {
  MockInstance.scope();

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

  const summary: ProjectionSummaryResponse = {
    id: 'p1',
    name: 'My Projection',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };

  const navigate = vi.fn();
  const createProjection = vi.fn(() => of(created));

  beforeEach(() => {
    navigate.mockClear();
    createProjection.mockClear();
    return MockBuilder(ProjectionCreateComponent)
      .keep(StatInfoService)
      .mock(PlayerService, { getPlayers: () => of([skater]) })
      .mock(ProjectionStorageService, { listProjections: () => of([]), createProjection })
      .provide({ provide: Router, useValue: { navigate } });
  });

  it('loads players and existing projections', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    expect(fixture.point.componentInstance.isLoading()).toEqual(false);
  });

  it('prefills the name with a suggestion and requires one to create', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.name()).toEqual('My Projection');
    expect(component.canCreate()).toEqual(true);
    component.name.set('   ');
    expect(component.canCreate()).toEqual(false);
  });

  it('suffixes the suggested name when it is already taken', async () => {
    MockInstance(
      ProjectionStorageService,
      'listProjections',
      vi.fn(() =>
        of([
          { ...summary, id: 'p1', name: 'My Projection' },
          { ...summary, id: 'p2', name: 'My Projection 2' },
        ]),
      ),
    );

    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.name()).toEqual('My Projection 3');
  });

  it('creates a projection and navigates to edit mode', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.name.set('Dynasty');
    component.create();

    expect(createProjection).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new-id']);
  });
});
