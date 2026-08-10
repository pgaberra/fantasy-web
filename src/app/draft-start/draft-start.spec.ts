import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { DraftStartComponent, LAST_SEASON_PRESET_NAME } from './draft-start';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

describe('DraftStartComponent', () => {
  const summary = (
    id: string,
    kind: ProjectionSummaryResponse['kind'],
    draftStatus: ProjectionSummaryResponse['draftStatus'] = 'none',
    updatedAt = '2026-06-01T00:00:00Z',
  ): ProjectionSummaryResponse => ({
    id,
    name: kind === 'preset_draft' ? LAST_SEASON_PRESET_NAME : `Projection ${id}`,
    kind,
    draftStatus,
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt,
  });

  const navigate = vi.fn();
  const listWithPresetDrafts = vi.fn();
  const createProjection = vi.fn();
  const deleteProjection = vi.fn();
  const notifyError = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    listWithPresetDrafts.mockClear();
    createProjection.mockClear();
    deleteProjection.mockClear();
    notifyError.mockClear();
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection')]));
    createProjection.mockReturnValue(of({ id: 'preset1' }));
    deleteProjection.mockReturnValue(of(undefined));
    return MockBuilder(DraftStartComponent)
      .mock(ProjectionStorageService, {
        listWithPresetDrafts,
        createProjection,
        deleteProjection,
      })
      .mock(NotificationService, { error: notifyError })
      .provide({ provide: Router, useValue: { navigate } });
  });

  const render = async () => {
    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  it('offers the projections newest-updated first and keeps the preset draft out of them', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'none', '2026-06-01T00:00:00Z'),
        summary('preset1', 'preset_draft', 'in_progress'),
        summary('p2', 'projection', 'none', '2026-06-10T00:00:00Z'),
      ]),
    );

    const component = await render();

    expect(component.projections().map((projection) => projection.id)).toEqual(['p2', 'p1']);
    expect(component.presetDraft()?.id).toEqual('preset1');
  });

  it('opens the draft board for a projection', async () => {
    const component = await render();

    component.openDraft('p1');

    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1', 'draft']);
  });

  it('seeds the preset draft server-side the first time it is started', async () => {
    const component = await render();

    component.startPreset();

    expect(createProjection).toHaveBeenCalledOnce();
    const request = createProjection.mock.calls[0][0];
    expect(request.name).toEqual(LAST_SEASON_PRESET_NAME);
    expect(request.kind).toEqual('preset_draft');
    expect(request.source).toEqual('default');
    expect(request.data.players).toEqual([]);
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset1', 'draft']);
  });

  it('resumes the stored preset draft instead of creating a second one', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('preset1', 'preset_draft', 'in_progress')]));

    const component = await render();
    component.startPreset();

    expect(createProjection).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset1', 'draft']);
    expect(component.presetLabel()).toEqual('Resume draft');
  });

  it('starting over replaces the stored preset draft with a fresh one', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('preset1', 'preset_draft', 'finished')]));
    createProjection.mockReturnValue(of({ id: 'preset2' }));

    const component = await render();
    component.requestRestart();
    component.confirmRestart();

    expect(deleteProjection).toHaveBeenCalledWith('preset1');
    expect(createProjection).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset2', 'draft']);
    expect(component.confirmingRestart()).toEqual(false);
  });

  it('surfaces a failed start and lets the user try again', async () => {
    createProjection.mockReturnValue(throwError(() => new Error('boom')));

    const component = await render();
    component.startPreset();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(component.isStarting()).toEqual(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reloads the sources on retry after a failed load', async () => {
    listWithPresetDrafts.mockReturnValue(throwError(() => new Error('boom')));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    expect(component.sourcesResource.error()).toBeTruthy();

    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection')]));
    component.retry();
    await fixture.whenStable();

    expect(component.sourcesResource.error()).toBeFalsy();
    expect(component.projections().map((projection) => projection.id)).toEqual(['p1']);
  });
});
