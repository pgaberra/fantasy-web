import { MockBuilder, MockInstance, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ProjectionCreateComponent } from './projection-create';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { StatInfoService } from '../services/stat-info.service';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

describe('ProjectionCreateComponent', () => {
  MockInstance.scope();

  const created: ProjectionResponse = {
    id: 'new-id',
    kind: 'projection',
    name: 'Dynasty',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: { settings: {} as never, players: [] },
  };

  const source: ProjectionResponse = {
    id: 'src',
    kind: 'projection',
    name: 'Source',
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
        leagueSize: 10,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 2, g: 2 },
        minGoalieGames: 25,
      },
      players: [
        { playerId: 1, type: 'skater', stats: { utility: { gp: 82 }, scoring: { goals: 64 } } },
      ],
    },
  };

  const summary: ProjectionSummaryResponse = {
    id: 'p1',
    kind: 'projection',
    name: 'My Projection',
    draftStatus: 'none',
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };

  const navigate = vi.fn();
  const createProjection = vi.fn<
    (request: CreateProjectionRequest) => Observable<ProjectionResponse>
  >(() => of(created));

  beforeEach(() => {
    navigate.mockClear();
    createProjection.mockClear();
    return MockBuilder(ProjectionCreateComponent)
      .keep(StatInfoService)
      .mock(ProjectionStorageService, {
        listProjections: () => of([]),
        createProjection,
        loadProjection: () => of(source),
      })
      .provide({ provide: Router, useValue: { navigate } });
  });

  it('loads the existing projections', async () => {
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

  it('redirects to the list when the server rejects a second projection (409)', async () => {
    createProjection.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.name.set('Dynasty');
    component.create();

    expect(navigate).toHaveBeenCalledWith(['/projections']);
  });

  it('creates from scratch with default (points) settings', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.create();

    expect(createProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({ scoringType: 'points' }),
        }),
      }),
    );
  });

  // The player rows are ~0.5 MB the client had just downloaded, and uploading them back was
  // failing outright for at least one user in production. The server derives them from source.
  it('asks the server to fill in the players instead of uploading them', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.create();

    const request = createProjection.mock.calls[0][0];
    expect(request.source).toEqual('default');
    expect(request.data.players).toEqual([]);
  });

  it('asks for zeroed players when creating a blank projection', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('blank');
    component.create();

    expect(createProjection.mock.calls[0][0].source).toEqual('blank');
  });

  // A copy carries rows that only the client has, so it must keep sending them.
  it('sends no source when copying an existing projection', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('copy');
    component.copyFromId.set('src');
    component.create();

    expect(createProjection.mock.calls[0][0].source).toBeUndefined();
  });

  it('copies the source projection data (settings and players) verbatim', async () => {
    const fixture = MockRender(ProjectionCreateComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.dataSource.set('copy');
    component.copyFromId.set('src');
    component.create();

    expect(createProjection).toHaveBeenCalledWith(expect.objectContaining({ data: source.data }));
  });
});
