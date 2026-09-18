import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { ProjectionListComponent } from './projection-list';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { PendingProjectionService } from '../services/pending-projection.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionData } from '../api/models/projection-data';
import { PlayerService } from '../services/player.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { SkaterStats } from '../models/projection.model';

describe('ProjectionListComponent', () => {
  const summaries: ProjectionSummaryResponse[] = [
    {
      id: 'p1',
      kind: 'projection',
      name: 'My league',
      draftStatus: 'none',
      season: '20262027',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 'p2',
      kind: 'projection',
      name: 'Newest league',
      draftStatus: 'none',
      season: '20262027',
      createdAt: '2026-06-02T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    },
    {
      id: 'p3',
      kind: 'projection',
      name: 'Middle league',
      draftStatus: 'none',
      season: '20262027',
      createdAt: '2026-06-03T00:00:00Z',
      updatedAt: '2026-06-05T00:00:00Z',
    },
  ];

  const demoData: ProjectionData = {
    settings: {
      scoringType: 'points',
      statWeights: { goals: 5 },
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      scaleSettings: {},
      decimalSettings: { goals: 0 },
      useDefaultDecimals: true,
    },
    players: [
      {
        playerId: 1,
        type: 'skater',
        stats: {
          utility: { gp: 82 },
          scoring: {
            stpg: 0,
            stpa: 0,
            stp: 0,
            hatTricks: 0,
            defPoints: 0,
            shifts: 0,
            toi: 0,
            goals: 60,
          },
        },
      },
    ],
  };

  const navigate = vi.fn();
  const listEditable = vi.fn(() => of(summaries));
  const deleteProjection = vi.fn(() => of(undefined));
  const clearDraft = vi.fn();
  const createProjection = vi.fn();
  const notifyError = vi.fn();
  const peek = vi.fn();
  const loadProjection = vi.fn();
  const getPlayers = vi.fn();
  const rowsToPublish = vi.fn();
  const clearPending = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    listEditable.mockClear();
    deleteProjection.mockClear();
    clearDraft.mockClear();
    createProjection.mockClear();
    notifyError.mockClear();
    peek.mockClear();
    clearPending.mockClear();
    listEditable.mockReturnValue(of(summaries));
    deleteProjection.mockReturnValue(of(undefined));
    clearDraft.mockReturnValue(of({ id: 'p1' }));
    peek.mockReturnValue(null);
    loadProjection.mockReturnValue(of({ id: 'p1', name: 'My league', data: demoData }));
    getPlayers.mockReturnValue(
      of([
        {
          id: 1,
          type: 'skater',
          name: 'McDavid',
          positions: new Set(['C']),
          stats: {} as SkaterStats,
        },
      ]),
    );
    rowsToPublish.mockReturnValue([]);
    return MockBuilder(ProjectionListComponent)
      .mock(ProjectionStorageService, {
        listEditable,
        deleteProjection,
        clearDraft,
        createProjection,
        loadProjection,
      })
      .mock(PlayerService, { getPlayers })
      .mock(ProjectionShareService, { rowsToPublish })
      .mock(NotificationService, { error: notifyError })
      .mock(PendingProjectionService, { peek, clear: clearPending })
      .provide({ provide: Router, useValue: { navigate } });
  });

  it('loads the saved projections', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    const component = fixture.point.componentInstance;
    expect(component.projectionsResource.value()).toEqual(summaries);
    expect(component.projectionsResource.isLoading()).toEqual(false);
  });

  it('sorts the projections newest-updated first', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    const order = fixture.point.componentInstance
      .sortedProjections()
      .map((projection) => projection.id);
    expect(order).toEqual(['p2', 'p3', 'p1']);
  });

  it('navigates to the create page', () => {
    const component = MockRender(ProjectionListComponent).point.componentInstance;
    component.createNew();
    expect(navigate).toHaveBeenCalledWith(['/projections/new']);
  });

  it('navigates to edit an existing projection', () => {
    const component = MockRender(ProjectionListComponent).point.componentInstance;
    component.edit('p1');
    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1']);
  });

  it('saves a projection carried over from the demo and opens it in the editor', async () => {
    listEditable.mockReturnValue(of([]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection', data: demoData });
    expect(clearPending).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new1']);
  });

  /** Names are unique per user, so the demo's copy cannot reuse one an existing projection has. */
  it('saves the demo beside an existing projection, under a name that is free', async () => {
    listEditable.mockReturnValue(of([{ ...summaries[0], name: 'My Projection' }]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection 2', data: demoData });
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new1']);
  });

  // The carried-over board joins the same list an imported one is in, and one namespace covers
  // both, so it may not take a name an imported board already holds either.
  it('saves the demo under a name no imported board is using', async () => {
    listEditable.mockReturnValue(
      of([{ ...summaries[0], kind: 'imported' as const, name: 'My Projection' }]),
    );
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection 2', data: demoData });
  });

  it('keeps the demo stash when saving it fails, so it can be retried', async () => {
    listEditable.mockReturnValue(of([]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(throwError(() => new Error('bff down')));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(clearPending).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
    expect(fixture.point.componentInstance.isSavingDemo()).toEqual(false);
  });

  it('shows the empty state when there are no saved projections', async () => {
    listEditable.mockReturnValue(of([]));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No projections yet');
  });

  it('enables the create button when there are no projections', async () => {
    listEditable.mockReturnValue(of([]));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.create-button');
    expect(button).not.toBeNull();
    expect(button.disabled).toEqual(false);
  });

  it('keeps the create button live once a projection exists — a user may keep several', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.create-button');
    expect(button).not.toBeNull();
    expect(button.disabled).toEqual(false);
  });

  it('reloads the list when retry is called', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    fixture.point.componentInstance.retry();
    await fixture.whenStable();

    expect(listEditable).toHaveBeenCalledTimes(2);
  });

  it('reloads the list after a delete', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.remove('p1');
    await fixture.whenStable();

    expect(deleteProjection).toHaveBeenCalledWith('p1');
    expect(listEditable).toHaveBeenCalledTimes(2);
  });

  it('notifies the user and keeps the list when a delete fails', async () => {
    deleteProjection.mockReturnValueOnce(throwError(() => new Error('network down')));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.remove('p1');
    await fixture.whenStable();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(listEditable).toHaveBeenCalledTimes(1);
  });

  it('opens sharing straight from the list, without visiting the projection', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.share('p1');
    await fixture.whenStable();

    expect(loadProjection).toHaveBeenCalledWith('p1');
    expect(getPlayers).toHaveBeenCalled();
    expect(component.sharingProjectionId()).toEqual('p1');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ranks the projection before opening, since a share publishes ranked rows', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.share('p1');
    await fixture.whenStable();

    expect(rowsToPublish).toHaveBeenCalled();
  });

  it('surfaces a failure to prepare the share instead of opening an empty dialog', async () => {
    loadProjection.mockReturnValue(throwError(() => new Error('boom')));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.share('p1');
    await fixture.whenStable();

    expect(component.sharingProjectionId()).toBeNull();
    expect(component.preparingShareFor()).toBeNull();
    expect(notifyError).toHaveBeenCalled();
  });

  it('reloads the list after a draft is discarded, so the card drops its pill', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.discardDraft('p1');
    await fixture.whenStable();

    // The picks go; the projection is not deleted with them.
    expect(clearDraft).toHaveBeenCalledWith('p1');
    expect(deleteProjection).not.toHaveBeenCalled();
    expect(listEditable).toHaveBeenCalledTimes(2);
  });

  it('notifies the user and keeps the list when a discard fails', async () => {
    clearDraft.mockReturnValueOnce(throwError(() => new Error('network down')));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    await fixture.point.componentInstance.discardDraft('p1');
    await fixture.whenStable();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(listEditable).toHaveBeenCalledTimes(1);
  });
});
