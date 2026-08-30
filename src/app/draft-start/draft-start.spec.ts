import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import {
  DraftStartComponent,
  LAST_SEASON_PRESET_NAME,
  MODEL_PRESET_NAME,
  Preset,
  PRESETS,
} from './draft-start';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';

describe('DraftStartComponent', () => {
  const LAST_SEASON = PRESETS.find((preset) => preset.id === 'last_season')!;
  const MODEL = PRESETS.find((preset) => preset.id === 'model')!;

  const summary = (
    id: string,
    kind: ProjectionSummaryResponse['kind'],
    draftStatus: ProjectionSummaryResponse['draftStatus'] = 'none',
    updatedAt = '2026-06-01T00:00:00Z',
    preset: Preset = LAST_SEASON,
  ): ProjectionSummaryResponse => ({
    id,
    name: kind === 'preset_draft' ? preset.name : `Projection ${id}`,
    kind,
    ...(kind === 'preset_draft' ? { preset: preset.id } : {}),
    draftStatus,
    season: '20262027',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt,
  });

  const imported = (
    id: string,
    author: string,
    name = `Board ${id}`,
  ): ProjectionSummaryResponse => ({
    ...summary(id, 'imported'),
    name,
    origin: { shareToken: `token-${id}`, authorUsername: author },
  });

  const navigate = vi.fn();
  const listWithPresetDrafts = vi.fn();
  const createProjection = vi.fn();
  const deleteProjection = vi.fn();
  const clearDraft = vi.fn();
  const notifyError = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    listWithPresetDrafts.mockClear();
    createProjection.mockClear();
    deleteProjection.mockClear();
    clearDraft.mockClear();
    notifyError.mockClear();
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection')]));
    createProjection.mockReturnValue(of({ id: 'preset1' }));
    deleteProjection.mockReturnValue(of(undefined));
    clearDraft.mockReturnValue(of({ id: 'p1' }));
    return (
      MockBuilder(DraftStartComponent)
        // The row actions live in one template the three lists share, so the outlet that renders
        // it has to be real: mocked away, every row comes out with no buttons at all.
        .keep(NgTemplateOutlet)
        .mock(ProjectionStorageService, {
          listWithPresetDrafts,
          createProjection,
          deleteProjection,
          clearDraft,
        })
        .mock(NotificationService, { error: notifyError })
        .provide({ provide: Router, useValue: { navigate } })
    );
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
    expect(component.presetDraft(LAST_SEASON)?.id).toEqual('preset1');
  });

  it('opens the draft board for a projection', async () => {
    const component = await render();

    component.openDraft('p1');

    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1', 'draft']);
  });

  it('seeds the preset draft server-side the first time it is started', async () => {
    const component = await render();

    component.startPreset(LAST_SEASON);

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
    component.startPreset(LAST_SEASON);

    expect(createProjection).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset1', 'draft']);
    expect(component.presetLabel(LAST_SEASON)).toEqual('Resume draft');
  });

  it('starting over replaces the stored preset draft with a fresh one', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('preset1', 'preset_draft', 'finished')]));
    createProjection.mockReturnValue(of({ id: 'preset2' }));

    const component = await render();
    component.requestRestart(LAST_SEASON);
    component.confirmRestart(LAST_SEASON);

    expect(deleteProjection).toHaveBeenCalledWith('preset1');
    expect(createProjection).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset2', 'draft']);
    expect(component.confirmingRestart()).toBeNull();
  });

  it('surfaces a failed start and lets the user try again', async () => {
    createProjection.mockReturnValue(throwError(() => new Error('boom')));

    const component = await render();
    component.startPreset(LAST_SEASON);

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

  it('keeps imported boards apart from the projections the user made', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection'), imported('i1', 'alex'), summary('preset1', 'preset_draft')]),
    );

    const component = await render();

    expect(component.projections().map((projection) => projection.id)).toEqual(['p1']);
    expect(component.imported().map((board) => board.id)).toEqual(['i1']);
  });

  it('says whose numbers an imported board holds', async () => {
    const component = await render();

    expect(component.sourceLabel(imported('i1', 'alex'))).toEqual('From alex');
    expect(component.sourceLabel(summary('p1', 'projection'))).toEqual('Your projection');
  });

  it('lifts every unfinished draft out of the lists, whatever it is drafted against', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'none'),
        summary('preset1', 'preset_draft', 'in_progress', '2026-06-02T00:00:00Z'),
        {
          ...imported('i1', 'alex'),
          draftStatus: 'in_progress',
          updatedAt: '2026-06-09T00:00:00Z',
        },
        summary('p2', 'projection', 'finished'),
      ]),
    );

    const component = await render();

    expect(component.inProgress().map((draft) => draft.id)).toEqual(['i1', 'preset1']);
  });

  it('re-reads the sources when a board is imported, so the copy joins the list', async () => {
    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.onImported();
    await fixture.whenStable();

    // The list is what the group reads from, and the copy is not in the one already fetched.
    expect(listWithPresetDrafts).toHaveBeenCalledTimes(2);
  });

  it('starts the AI preset from the model source, not last season', async () => {
    const component = await render();

    component.startPreset(MODEL);

    expect(createProjection).toHaveBeenCalledOnce();
    const request = createProjection.mock.calls[0][0];
    expect(request.name).toEqual(MODEL_PRESET_NAME);
    expect(request.kind).toEqual('preset_draft');
    expect(request.source).toEqual('model');
    expect(request.data.players).toEqual([]);
  });

  it('keeps the two presets apart, each with its own stored draft', async () => {
    // Both are kind: 'preset_draft', so only the name tells them apart. Getting this wrong
    // would resume the wrong board — or refuse to start the second preset at all.
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('lastSeason1', 'preset_draft', 'in_progress', '2026-06-01T00:00:00Z'),
        summary('model1', 'preset_draft', 'finished', '2026-06-02T00:00:00Z', MODEL),
      ]),
    );

    const component = await render();

    expect(component.presetDraft(LAST_SEASON)?.id).toEqual('lastSeason1');
    expect(component.presetDraft(MODEL)?.id).toEqual('model1');
    expect(component.presetLabel(LAST_SEASON)).toEqual('Resume draft');
    expect(component.presetLabel(MODEL)).toEqual('View summary');
  });

  // Drafts saved before the server recorded the preset carry none. Every one of them came from
  // last season's stats, so they must still land on that row rather than disappearing from it.
  it('resolves a stored draft that predates the preset field', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([{ ...summary('legacy1', 'preset_draft', 'in_progress'), preset: undefined }]),
    );

    const component = await render();

    expect(component.presetDraft(LAST_SEASON)?.id).toEqual('legacy1');
    expect(component.presetDraft(MODEL)).toBeNull();
  });

  it('confirming a restart on one preset does not arm the other', async () => {
    const component = await render();

    component.requestRestart(MODEL);

    expect(component.isConfirmingRestart(MODEL)).toBe(true);
    expect(component.isConfirmingRestart(LAST_SEASON)).toBe(false);
  });
  // The point of dropping the tabs: nothing here is a click away any more, the import box
  // included — it used to sit behind the one tab that is empty until it has been used once.
  it('shows every group, and the import box, without a click', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'none')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const headings = Array.from(
      fixture.nativeElement.querySelectorAll('.group-title') as NodeListOf<HTMLElement>,
    ).map((heading) => heading.textContent?.trim());

    expect(headings).toEqual(['Presets', 'Your projections', 'Shared with you']);
    expect(fixture.nativeElement.querySelector('app-share-import')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.row')).toHaveLength(PRESETS.length + 1);
  });

  it('clears the picks off a projection, keeping the projection itself', async () => {
    const draft = summary('p1', 'projection', 'in_progress');
    listWithPresetDrafts.mockReturnValue(of([draft]));

    const component = await render();
    component.requestDiscard(draft);
    expect(component.isConfirmingDiscard(draft)).toEqual(true);
    component.confirmDiscard(draft);

    expect(deleteProjection).not.toHaveBeenCalled();
    // What clearing means is the storage service's business; here it only has to be asked.
    expect(clearDraft).toHaveBeenCalledWith('p1');
    expect(component.confirmingDiscard()).toBeNull();
    expect(component.isDiscarding(draft)).toEqual(false);
  });

  it('discards a preset draft by deleting it, since it holds nothing but the picks', async () => {
    const draft = summary('preset1', 'preset_draft', 'in_progress');
    listWithPresetDrafts.mockReturnValue(of([draft]));

    const component = await render();
    component.confirmDiscard(draft);

    expect(deleteProjection).toHaveBeenCalledWith('preset1');
    expect(clearDraft).not.toHaveBeenCalled();
  });

  it('reloads the sources once a draft is discarded, so its row goes away', async () => {
    const draft = summary('p1', 'projection', 'in_progress');
    listWithPresetDrafts.mockReturnValue(of([draft]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'none')]));

    component.confirmDiscard(draft);
    await fixture.whenStable();

    expect(component.inProgress()).toEqual([]);
  });

  it('surfaces a failed discard and leaves the row where it was', async () => {
    const draft = summary('p1', 'projection', 'in_progress');
    listWithPresetDrafts.mockReturnValue(of([draft]));
    clearDraft.mockReturnValue(throwError(() => new Error('boom')));

    const component = await render();
    component.confirmDiscard(draft);

    expect(notifyError).toHaveBeenCalledOnce();
    expect(component.isDiscarding(draft)).toEqual(false);
    expect(component.inProgress().map((row) => row.id)).toEqual(['p1']);
  });

  it('backing out of the confirmation discards nothing', async () => {
    const draft = summary('p1', 'projection', 'in_progress');
    listWithPresetDrafts.mockReturnValue(of([draft]));

    const component = await render();
    component.requestDiscard(draft);
    component.cancelDiscard();

    expect(component.isConfirmingDiscard(draft)).toEqual(false);
    expect(clearDraft).not.toHaveBeenCalled();
    expect(deleteProjection).not.toHaveBeenCalled();
  });

  it('says what a discard costs, which differs between a preset draft and a board', async () => {
    const component = await render();

    expect(component.discardPrompt(summary('preset1', 'preset_draft', 'in_progress'))).toEqual(
      'Discard this draft? The picks are lost.',
    );
    expect(component.discardPrompt(summary('p1', 'projection', 'in_progress'))).toEqual(
      'Discard the picks? The projection stays.',
    );
  });

  it('offers the discard beside the resume, and asks before it acts', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'in_progress')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const buttons = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll('.row--resume button') as NodeListOf<HTMLElement>,
      ).map((button) => button.textContent?.trim());

    expect(buttons()).toEqual(['Resume draft', 'Discard draft']);

    fixture.point.componentInstance.requestDiscard(summary('p1', 'projection', 'in_progress'));
    fixture.detectChanges();

    expect(buttons()).toEqual(['Yes, discard', 'Cancel']);
    expect(
      (
        fixture.nativeElement.querySelector('.row--resume .confirm-text') as HTMLElement
      ).textContent?.trim(),
    ).toEqual('Discard the picks? The projection stays.');
  });

  it('offers the discard on a finished draft too, beside its summary', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection', 'finished'), summary('p2', 'projection', 'none')]),
    );

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.group--own .row') as NodeListOf<HTMLElement>,
    ).map((row) =>
      Array.from(row.querySelectorAll('button') as NodeListOf<HTMLElement>).map((button) =>
        button.textContent?.trim(),
      ),
    );

    // The finished one can be looked at or thrown away; the one never drafted has nothing to lose.
    expect(rows).toEqual([['View summary', 'Discard draft'], ['Start draft']]);
  });

  it('discarding a finished draft clears the picks and leaves the projection to draft again', async () => {
    const finished = summary('p1', 'projection', 'finished');
    listWithPresetDrafts.mockReturnValue(of([finished]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'none')]));

    component.confirmDiscard(finished);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(clearDraft).toHaveBeenCalledWith('p1');
    expect(
      (
        fixture.nativeElement.querySelector('.group--own .row button') as HTMLElement
      ).textContent?.trim(),
    ).toEqual('Start draft');
  });

  it('marks the discard as destructive without dressing it as the main action', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'in_progress')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const discard = fixture.nativeElement.querySelector(
      '.row--resume button.btn-danger-quiet',
    ) as HTMLElement;

    expect(discard.textContent?.trim()).toEqual('Discard draft');
    // The solid red belongs to the confirmation, not to the button that only asks for it.
    expect(discard.classList.contains('btn-danger')).toEqual(false);
  });
});
