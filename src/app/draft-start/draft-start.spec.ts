import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  DraftStartComponent,
  LAST_SEASON_PRESET_NAME,
  MODEL_PRESET_NAME,
  Preset,
  PRESETS,
  shareTokenFrom,
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
  const importFromShare = vi.fn();
  const createProjection = vi.fn();
  const deleteProjection = vi.fn();
  const notifyError = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    listWithPresetDrafts.mockClear();
    createProjection.mockClear();
    deleteProjection.mockClear();
    notifyError.mockClear();
    importFromShare.mockClear();
    importFromShare.mockReturnValue(of({ id: 'i1' }));
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection')]));
    createProjection.mockReturnValue(of({ id: 'preset1' }));
    deleteProjection.mockReturnValue(of(undefined));
    return MockBuilder(DraftStartComponent)
      .mock(ProjectionStorageService, {
        listWithPresetDrafts,
        createProjection,
        deleteProjection,
        importFromShare,
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

  describe('importing a shared board', () => {
    it('takes the token out of a pasted share link', () => {
      expect(shareTokenFrom('https://slapstat.com/s/aBc123_-xyz')).toEqual('aBc123_-xyz');
      expect(shareTokenFrom('  /s/aBc123_-xyz  ')).toEqual('aBc123_-xyz');
      expect(shareTokenFrom('aBc123_-xyz')).toEqual('aBc123_-xyz');
      expect(shareTokenFrom('https://example.com/nothing')).toBeNull();
      expect(shareTokenFrom('short')).toBeNull();
    });

    it('imports the pasted link and shows the board it copied', async () => {
      const component = await render();
      component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');

      component.importShared();

      expect(importFromShare).toHaveBeenCalledWith('aBc123_-xyz', undefined);
      expect(component.shareInput()).toEqual('');
      expect(component.selectedTab()).toEqual('imported');
      expect(component.isImporting()).toEqual(false);
    });

    it('rejects something that is not a share link without calling the server', async () => {
      const component = await render();
      component.shareInput.set('https://example.com/nothing');

      component.importShared();

      expect(importFromShare).not.toHaveBeenCalled();
      expect(component.importHint()).toBeTruthy();
    });

    /** Two people can name a projection the same thing; only the importer can settle it. */
    it('asks for a name when one is already taken, then imports under it', async () => {
      importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

      const component = await render();
      component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
      component.importShared();

      expect(component.importName()).toEqual('');
      expect(component.importHint()).toBeTruthy();

      importFromShare.mockReturnValue(of({ id: 'i2' }));
      component.importName.set("Alex's board");
      component.importShared();

      expect(importFromShare).toHaveBeenLastCalledWith('aBc123_-xyz', "Alex's board");
      expect(component.importName()).toBeNull();
    });

    it('says so when the link has gone', async () => {
      importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      const component = await render();
      component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
      component.importShared();

      expect(component.importHint()).toBeTruthy();
      expect(notifyError).not.toHaveBeenCalled();
    });

    it('surfaces any other failure as a toast', async () => {
      importFromShare.mockReturnValue(throwError(() => new Error('boom')));

      const component = await render();
      component.shareInput.set('https://slapstat.com/s/aBc123_-xyz');
      component.importShared();

      expect(notifyError).toHaveBeenCalledOnce();
      expect(component.isImporting()).toEqual(false);
    });
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
  it('keeps both tab labels in the markup so the width can pick one', async () => {
    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.tab-label') as NodeListOf<HTMLElement>,
    ).map((label) => label.textContent?.trim());

    expect(labels).toEqual(['Your projections', 'Yours', 'Shared with you', 'Shared', 'Presets']);
  });
});
