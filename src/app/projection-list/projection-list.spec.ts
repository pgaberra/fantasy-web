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

describe('ProjectionListComponent', () => {
  const summaries: ProjectionSummaryResponse[] = [
    {
      id: 'p1',
      name: 'My league',
      draftStatus: 'none',
      kind: 'projection',
      season: '20262027',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 'p2',
      name: 'Newest league',
      draftStatus: 'none',
      kind: 'projection',
      season: '20262027',
      createdAt: '2026-06-02T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    },
    {
      id: 'p3',
      name: 'Middle league',
      draftStatus: 'none',
      kind: 'projection',
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
      { playerId: 1, type: 'skater', stats: { utility: { gp: 82 }, scoring: { goals: 60 } } },
    ],
  };

  const navigate = vi.fn();
  const listProjections = vi.fn(() => of(summaries));
  const deleteProjection = vi.fn(() => of(undefined));
  const createProjection = vi.fn();
  const notifyError = vi.fn();
  const peek = vi.fn();
  const clearPending = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    listProjections.mockClear();
    deleteProjection.mockClear();
    createProjection.mockClear();
    notifyError.mockClear();
    peek.mockClear();
    clearPending.mockClear();
    listProjections.mockReturnValue(of(summaries));
    deleteProjection.mockReturnValue(of(undefined));
    peek.mockReturnValue(null);
    return MockBuilder(ProjectionListComponent)
      .mock(ProjectionStorageService, { listProjections, deleteProjection, createProjection })
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
    listProjections.mockReturnValue(of([]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection', data: demoData });
    expect(clearPending).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new1']);
  });

  it('keeps an existing projection rather than overwriting it with the demo', async () => {
    peek.mockReturnValue(demoData);

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).not.toHaveBeenCalled();
    expect(clearPending).toHaveBeenCalledOnce();
    expect(notifyError).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1']);
  });

  it('keeps the demo stash when saving it fails, so it can be retried', async () => {
    listProjections.mockReturnValue(of([]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(throwError(() => new Error('bff down')));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(clearPending).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
    expect(fixture.point.componentInstance.isSavingDemo()).toEqual(false);
  });

  it('shows the empty state when there are no saved projections', async () => {
    listProjections.mockReturnValue(of([]));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No projections yet');
  });

  it('enables the create button when there are no projections', async () => {
    listProjections.mockReturnValue(of([]));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.create-button');
    expect(button).not.toBeNull();
    expect(button.disabled).toEqual(false);
  });

  it('disables the create button with a note once a projection exists (one per user)', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.create-button');
    expect(button).not.toBeNull();
    expect(button.disabled).toEqual(true);
    expect(fixture.nativeElement.textContent).toContain('one projection per account');
  });

  it('reloads the list when retry is called', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listProjections).toHaveBeenCalledTimes(1);

    fixture.point.componentInstance.retry();
    await fixture.whenStable();

    expect(listProjections).toHaveBeenCalledTimes(2);
  });

  it('reloads the list after a delete', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listProjections).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.remove('p1');
    await fixture.whenStable();

    expect(deleteProjection).toHaveBeenCalledWith('p1');
    expect(listProjections).toHaveBeenCalledTimes(2);
  });

  it('notifies the user and keeps the list when a delete fails', async () => {
    deleteProjection.mockReturnValueOnce(throwError(() => new Error('network down')));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listProjections).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.remove('p1');
    await fixture.whenStable();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(listProjections).toHaveBeenCalledTimes(1);
  });
});
