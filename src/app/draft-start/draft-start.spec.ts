import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import {
  DraftStartComponent,
  LAST_SEASON_PRESET_NAME,
  MODEL_PRESET_NAME,
  Preset,
  PRESETS,
} from './draft-start';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { PopoverTriggerDirective } from '../shared/popover/popover-trigger.directive';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { environment } from '../../environments/environment';

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
        // The row menu is a real overlay, and mocked away the kebab opens nothing at all.
        .keep(PopoverTriggerDirective)
        .mock(ProjectionStorageService, {
          listWithPresetDrafts,
          createProjection,
          deleteProjection,
          clearDraft,
        })
        .mock(NotificationService, { error: notifyError })
        .provide({ provide: Router, useValue: { navigate } })
        // The component pulls in RouterLink, which has ng-mocks mock the router's location
        // providers too — and the CDK overlay behind the row menu needs a real one to open.
        .provide(provideLocationMocks())
    );
  });

  const render = async () => {
    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  const menuPanel = () => document.querySelector('.draft-menu-panel');

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

  it('stops offering a preset once it has a draft, since the draft is the way back to it', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('preset1', 'preset_draft', 'in_progress')]));

    const component = await render();

    expect(component.availablePresets().map((preset) => preset.id)).toEqual(['model']);
    expect(component.drafts().map((draft) => draft.id)).toEqual(['preset1']);
  });

  // Belt and braces for a draft started in another tab since this list was read: the row is gone
  // from the page, but the call must still resume rather than seed a second board for the preset.
  it('resumes the stored preset draft instead of creating a second one', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('preset1', 'preset_draft', 'in_progress')]));

    const component = await render();
    component.startPreset(LAST_SEASON);

    expect(createProjection).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset1', 'draft']);
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

  it('says whose numbers a row holds', async () => {
    const component = await render();

    expect(component.sourceLabel(imported('i1', 'alex'))).toEqual('From alex');
    expect(component.sourceLabel(summary('p1', 'projection'))).toEqual('Your projection');
    // A preset draft is nobody's work, so neither answer above fits it.
    expect(component.sourceLabel(summary('preset1', 'preset_draft'))).toEqual('Preset');
  });

  it('says what the timestamp on a draft means, which is not the same once it is over', async () => {
    const component = await render();

    expect(component.timingLabel(summary('p1', 'projection', 'in_progress'))).toEqual('last pick');
    expect(component.timingLabel(summary('p2', 'projection', 'finished'))).toEqual('finished');
  });

  it('gathers every draft into one list, unfinished first and newest first within that', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'none'),
        summary('preset1', 'preset_draft', 'in_progress', '2026-06-02T00:00:00Z'),
        {
          ...imported('i1', 'alex'),
          draftStatus: 'in_progress' as const,
          updatedAt: '2026-06-09T00:00:00Z',
        },
        summary('p2', 'projection', 'finished', '2026-06-20T00:00:00Z'),
      ]),
    );

    const component = await render();

    // The finished one sorts last despite being the most recently touched: a draft still being
    // made is what the section is for.
    expect(component.drafts().map((draft) => draft.id)).toEqual(['i1', 'preset1', 'p2']);
  });

  // The bug the two sections exist to kill: a draft used to be copied to the top of the page
  // while its source stayed in the list below, so one draft answered to two rows.
  it('renders nothing twice, whatever a draft was started against', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'in_progress'),
        summary('p2', 'projection', 'none'),
        { ...imported('i1', 'alex'), draftStatus: 'finished' as const },
        imported('i2', 'bulle'),
        summary('preset1', 'preset_draft', 'in_progress'),
      ]),
    );

    const component = await render();
    const ids = [...component.drafts(), ...component.projections(), ...component.imported()].map(
      (row) => row.id,
    );

    expect(ids).toEqual(['p1', 'preset1', 'i1', 'p2', 'i2']);
    expect(new Set(ids).size).toEqual(ids.length);
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

  // The row is the only way in here, so dropping it is what switching the feature off means.
  it('drops the AI preset from the picker when the AI projection is switched off', async () => {
    const original = environment.aiProjectionEnabled;
    environment.aiProjectionEnabled = false;
    try {
      const component = await render();

      expect(component.presets.map((preset) => preset.id)).toEqual(['last_season']);
    } finally {
      environment.aiProjectionEnabled = original;
    }
  });

  it('keeps the two presets apart, each with its own stored draft', async () => {
    // Both are kind: 'preset_draft', so only the recorded preset tells them apart. Getting this
    // wrong would resume the wrong board, or offer a preset that already has a draft.
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('lastSeason1', 'preset_draft', 'in_progress', '2026-06-01T00:00:00Z'),
        summary('model1', 'preset_draft', 'finished', '2026-06-02T00:00:00Z', MODEL),
      ]),
    );

    const component = await render();

    expect(component.presetDraft(LAST_SEASON)?.id).toEqual('lastSeason1');
    expect(component.presetDraft(MODEL)?.id).toEqual('model1');
    expect(component.availablePresets()).toEqual([]);
    expect(component.draftLabel('in_progress')).toEqual('Resume draft');
    expect(component.draftLabel('finished')).toEqual('View summary');
  });

  // Drafts saved before the server recorded the preset carry none. Every one of them came from
  // last season's stats, so they must still match that preset rather than orphaning it.
  it('resolves a stored draft that predates the preset field', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([{ ...summary('legacy1', 'preset_draft', 'in_progress'), preset: undefined }]),
    );

    const component = await render();

    expect(component.presetDraft(LAST_SEASON)?.id).toEqual('legacy1');
    expect(component.presetDraft(MODEL)).toBeNull();
  });

  // The point of dropping the tabs: nothing here is a click away any more, the import box
  // included — it used to sit behind the one tab that is empty until it has been used once.
  it('shows every group, and the import box, without a click', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'none')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (selector: string) =>
      Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>).map(
        (element) => element.textContent?.trim(),
      );

    // Nothing is drafted yet, so the page is one question rather than two.
    expect(text('.section-title')).toEqual(['Start a new draft']);
    expect(text('.group-title')).toEqual(['Presets', 'Your projections', 'Shared with you']);
    expect(fixture.nativeElement.querySelector('app-share-import')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.preset')).toHaveLength(PRESETS.length);
    expect(fixture.nativeElement.querySelectorAll('.row')).toHaveLength(1);
  });

  // A preset needs nothing of the user's, so it is the page's ready-made way in and gets the
  // loud button; a projection or a shared board is work someone did first and is found by
  // name, so its row can be quiet. One list of identical buttons gave the page no way in.
  it('offers the presets as cards with the loud button, and the rest as quiet rows', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection', 'none'), imported('i1', 'alex')]),
    );

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const presetButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.preset .start') as NodeListOf<HTMLElement>,
    );
    const rowButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.row .start') as NodeListOf<HTMLElement>,
    );

    expect(presetButtons).toHaveLength(PRESETS.length);
    expect(presetButtons.every((button) => button.classList.contains('btn-primary'))).toBe(true);
    expect(rowButtons.map((button) => button.textContent?.trim())).toEqual([
      'Start draft',
      'Start draft',
    ]);
    expect(rowButtons.every((button) => button.classList.contains('btn-secondary'))).toBe(true);
  });

  // Resuming is what most visits are for; reading a summary is not. The two used to share a
  // button, so a page of finished drafts was as loud as a page of drafts still being made.
  it('gives the resume the loud button and the summary the quiet one', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'in_progress'),
        summary('p2', 'projection', 'finished', '2026-06-20T00:00:00Z'),
      ]),
    );

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const resumes = Array.from(
      fixture.nativeElement.querySelectorAll('.draft .resume') as NodeListOf<HTMLElement>,
    );
    const statuses = Array.from(
      fixture.nativeElement.querySelectorAll('.draft-status') as NodeListOf<HTMLElement>,
    ).map((status) => status.textContent?.trim());

    expect(resumes.map((button) => button.textContent?.trim())).toEqual([
      'Resume draft',
      'View summary',
    ]);
    expect(resumes[0].classList.contains('btn-primary')).toBe(true);
    expect(resumes[1].classList.contains('btn-secondary')).toBe(true);
    expect(statuses).toEqual(['In progress', 'Complete']);
  });

  // The empty state links to the new-projection page; a list that is not empty used to lose
  // that door, though it is the only way to more projections from here.
  it('keeps the way to a new projection beside the projections already listed', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'none')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    // RouterLink is mocked away with the rest of the router here, so the anchor carries no
    // href; the directive's input is what says where it goes.
    const link = ngMocks.find(fixture, '.create-projection');

    expect(ngMocks.input(link, 'routerLink')).toEqual('/projections/new');
    expect(link.nativeElement.textContent?.trim()).toEqual('+ Create a new projection');
  });

  it('leads with the drafts, and drops their sources out of the lists below', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection', 'in_progress'), summary('p2', 'projection', 'none')]),
    );

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const sectionTitles = Array.from(
      fixture.nativeElement.querySelectorAll('.section-title') as NodeListOf<HTMLElement>,
    ).map((heading) => heading.textContent?.trim());
    const draftNames = Array.from(
      fixture.nativeElement.querySelectorAll('.draft-name') as NodeListOf<HTMLElement>,
    ).map((name) => name.textContent?.trim());
    const rowNames = Array.from(
      fixture.nativeElement.querySelectorAll('.row-name') as NodeListOf<HTMLElement>,
    ).map((name) => name.textContent?.trim());

    expect(sectionTitles).toEqual(['Your drafts', 'Start a new draft']);
    expect(draftNames).toEqual(['Projection p1']);
    expect(rowNames).not.toContain('Projection p1');
    expect(rowNames).toContain('Projection p2');
  });

  it('keeps the discard behind the row menu rather than beside the resume', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'in_progress')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.draft-actions button') as NodeListOf<HTMLElement>,
    ).map((button) => button.textContent?.trim());
    // The kebab carries an icon and no text, so the only label on the card is the resume.
    expect(buttons).toEqual(['Resume draft', '']);

    (fixture.nativeElement.querySelector('.draft-menu') as HTMLElement).click();

    const items = Array.from(menuPanel()?.querySelectorAll('.menu-item') ?? []).map((item) =>
      item.textContent?.trim(),
    );
    expect(items).toEqual(['Open the projection', 'Discard draft']);
    expect(menuPanel()?.querySelector('.discard')?.classList.contains('menu-item--danger')).toBe(
      true,
    );
  });

  // The board is the picks and nothing else, and it is not in "Your projections" to open.
  it('offers no way into the board behind a preset draft', async () => {
    const component = await render();

    expect(component.canOpenBoard(summary('preset1', 'preset_draft', 'in_progress'))).toBe(false);
    expect(component.canOpenBoard(summary('p1', 'projection', 'in_progress'))).toBe(true);
    expect(component.canOpenBoard(imported('i1', 'alex'))).toBe(true);
  });

  it('opens the projection behind a draft, rather than the draft board', async () => {
    const component = await render();

    component.openBoard('p1');

    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1']);
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

  // What "Start over" used to be: the preset comes back to the list, ready to be started fresh.
  it('puts a preset back on offer once its draft is discarded', async () => {
    const draft = summary('preset1', 'preset_draft', 'finished');
    listWithPresetDrafts.mockReturnValue(of([draft]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    expect(component.availablePresets().map((preset) => preset.id)).toEqual(['model']);

    listWithPresetDrafts.mockReturnValue(of([]));
    component.confirmDiscard(draft);
    await fixture.whenStable();

    expect(deleteProjection).toHaveBeenCalledWith('preset1');
    expect(component.availablePresets().map((preset) => preset.id)).toEqual([
      'last_season',
      'model',
    ]);
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

    expect(component.drafts()).toEqual([]);
  });

  it('surfaces a failed discard and leaves the row where it was', async () => {
    const draft = summary('p1', 'projection', 'in_progress');
    listWithPresetDrafts.mockReturnValue(of([draft]));
    clearDraft.mockReturnValue(throwError(() => new Error('boom')));

    const component = await render();
    component.confirmDiscard(draft);

    expect(notifyError).toHaveBeenCalledOnce();
    expect(component.isDiscarding(draft)).toEqual(false);
    expect(component.drafts().map((row) => row.id)).toEqual(['p1']);
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

  it('asks before it discards, in the card the draft lives in', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'in_progress')]));

    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.point.componentInstance.requestDiscard(summary('p1', 'projection', 'in_progress'));
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.draft-actions button') as NodeListOf<HTMLElement>,
    ).map((button) => button.textContent?.trim());

    expect(buttons).toEqual(['Yes, discard', 'Cancel']);
    expect(
      (fixture.nativeElement.querySelector('.confirm-text') as HTMLElement).textContent?.trim(),
    ).toEqual('Discard the picks? The projection stays.');
  });

  it('discarding a finished draft leaves the projection to be drafted again', async () => {
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
    expect(fixture.nativeElement.querySelector('.draft')).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('.row button') as HTMLElement).textContent?.trim(),
    ).toEqual('Start draft');
  });
});
