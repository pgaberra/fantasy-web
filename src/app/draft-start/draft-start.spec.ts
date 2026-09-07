import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
import { EntitlementService } from '../services/entitlement.service';
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
  const premium = signal(false);
  const loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded');

  beforeEach(() => {
    premium.set(false);
    loadState.set('loaded');
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
        .mock(EntitlementService, { premium, loadState })
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

  const renderFixture = async () => {
    const fixture = MockRender(DraftStartComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const texts = (fixture: { nativeElement: HTMLElement }, selector: string) =>
    Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>(selector)).map((element) =>
      element.textContent?.trim(),
    );

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

    fixture.point.componentInstance.onImported('i9');
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

  // The choice is made in steps: the kind first, and the page opens on the presets since they
  // need nothing prepared. The other two kinds are segments that say how much they hold.
  it('asks for the kind of source first, opening on the presets with the rest folded', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection', 'none'), imported('i1', 'alex')]),
    );

    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    // Nothing is drafted yet, so the page is one question rather than two.
    expect(texts(fixture, '.section-title')).toEqual(['Start a new draft']);
    expect(texts(fixture, '.kind-name')).toEqual(['Preset', 'Your projection', 'Shared board']);
    expect(texts(fixture, '.kind-count')).toEqual(['2', '1', '1']);
    // A segmented control, not radios: the pressed one is said on the button itself.
    const pressed = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.segmented .kind'),
    ).map((segment) => segment.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['true', 'false', 'false']);
    expect(component.sourceKind()).toEqual('preset');
    expect(texts(fixture, '.row-name')).toEqual([LAST_SEASON_PRESET_NAME, MODEL_PRESET_NAME]);
    expect(fixture.nativeElement.querySelector('app-share-import')).toBeNull();
  });

  // One card for every choice, whichever tile is open. The presets were cards and the boards a
  // ruled list for a release, and switching tiles then switched the control under them.
  it('draws every choice as the same card, whichever tile is open', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection', 'none'), imported('i1', 'alex')]),
    );

    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    const cards = () => Array.from(root.querySelectorAll<HTMLElement>('.row'));
    const selected = () => cards().map((card) => card.classList.contains('row--selected'));

    // Presets: two cards, an icon on each, the checked one marked on the card itself.
    expect(cards()).toHaveLength(PRESETS.length);
    expect(root.querySelectorAll('.row-icon svg')).toHaveLength(PRESETS.length);
    expect(selected()).toEqual([true, false]);
    component.selectPreset(MODEL);
    fixture.detectChanges();
    expect(selected()).toEqual([false, true]);

    // The same card for a projection and for a shared board: radio, icon, outline and meta.
    for (const kind of ['projection', 'imported'] as const) {
      component.sourceKind.set(kind);
      fixture.detectChanges();
      expect(cards()).toHaveLength(1);
      expect(root.querySelectorAll('.row-icon svg')).toHaveLength(1);
      expect(root.querySelectorAll('.row-choice input[type="radio"]')).toHaveLength(1);
      expect(selected()).toEqual([true]);
      expect(root.querySelector('.row-meta')).not.toBeNull();
    }
  });

  // The badge says the AI projection is sold. Rendered once per state rather than twice in one
  // test: two live fixtures over a flipped flag re-check the first against the new value, which
  // Angular reports as ExpressionChangedAfterItHasBeenChecked.
  it('marks the AI projection as Premium where payments are on', async () => {
    const original = environment.paymentsEnabled;
    environment.paymentsEnabled = true;
    try {
      const fixture = await renderFixture();
      const component = fixture.point.componentInstance;

      expect(component.showsPremiumBadge(MODEL)).toBe(true);
      // Only the one that is sold: last season's stats is in every build.
      expect(component.showsPremiumBadge(LAST_SEASON)).toBe(false);
      expect(texts(fixture, '.row-badge')).toEqual(['Premium']);
    } finally {
      environment.paymentsEnabled = original;
    }
  });

  // Without payments the AI projection is free and ungated, and a badge naming a subscription
  // this build cannot sell promises something nobody can act on.
  it('leaves the badge off where there is no way to buy anything', async () => {
    const original = environment.paymentsEnabled;
    environment.paymentsEnabled = false;
    try {
      const fixture = await renderFixture();

      expect(fixture.point.componentInstance.showsPremiumBadge(MODEL)).toBe(false);
      expect(fixture.nativeElement.querySelector('.row-badge')).toBeNull();
      // The preset itself is still on offer; only the mark on it is held back.
      expect(texts(fixture, '.row-name')).toEqual([LAST_SEASON_PRESET_NAME, MODEL_PRESET_NAME]);
    } finally {
      environment.paymentsEnabled = original;
    }
  });

  // A kind with nothing in it still has its segment, with a 0 on it: the count is what keeps the
  // fold honest, and the panel's empty state says the rest once it is pressed.
  it('counts an empty kind as 0 on its segment rather than dropping it', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('lastSeason1', 'preset_draft', 'in_progress'),
        summary('model1', 'preset_draft', 'finished', '2026-06-02T00:00:00Z', MODEL),
      ]),
    );

    const fixture = await renderFixture();

    expect(texts(fixture, '.kind-count')).toEqual(['0', '0', '0']);
    // Nothing to open on, so the page lands on the last kind, whose empty state offers the
    // one way to get something: the paste field.
    expect(fixture.point.componentInstance.sourceKind()).toEqual('imported');
    expect(texts(fixture, '.group-empty')[0]).toContain('No imported projections yet');
  });

  // One press to a draft: the first row of the open kind is checked from the start, and the
  // one Start button on the page drafts against it.
  it('checks the first preset from the start, so one press seeds and opens it', async () => {
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    expect(component.selection()).toEqual({ kind: 'preset', preset: LAST_SEASON });
    expect(texts(fixture, '.start')).toEqual(['Start draft']);

    (fixture.nativeElement.querySelector('.start') as HTMLButtonElement).click();

    expect(createProjection).toHaveBeenCalledOnce();
    expect(createProjection.mock.calls[0][0].source).toEqual('default');
    expect(navigate).toHaveBeenCalledWith(['/projections', 'preset1', 'draft']);
  });

  it('switches the rows with the tile, and checks the first of the new kind', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'none', '2026-06-01T00:00:00Z'),
        summary('p2', 'projection', 'none', '2026-06-10T00:00:00Z'),
      ]),
    );

    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.sourceKind.set('projection');
    fixture.detectChanges();

    expect(texts(fixture, '.row-name')).toEqual(['Projection p2', 'Projection p1']);
    expect(component.selection()).toEqual({ kind: 'board', id: 'p2' });
    expect(component.isBoardSelected('p2')).toBe(true);

    component.selectBoard('p1');
    component.start();

    // A board already exists; nothing to seed, just open it.
    expect(createProjection).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1', 'draft']);
  });

  it('opens on the projections when every preset is drafted already', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('lastSeason1', 'preset_draft', 'in_progress'),
        summary('model1', 'preset_draft', 'finished', '2026-06-02T00:00:00Z', MODEL),
        summary('p1', 'projection', 'none'),
      ]),
    );

    const component = await render();

    expect(component.sourceKind()).toEqual('projection');
    expect(component.selection()).toEqual({ kind: 'board', id: 'p1' });
  });

  it('disables Start when the open kind has nothing to draft against', async () => {
    listWithPresetDrafts.mockReturnValue(of([]));

    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.sourceKind.set('projection');
    fixture.detectChanges();

    expect(component.selection()).toBeNull();
    expect((fixture.nativeElement.querySelector('.start') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(texts(fixture, '.group-empty')[0]).toContain('No projections yet.');
  });

  // The paste field lives with the shared boards; the tile says the kind is there to be used.
  it('keeps the import box with the shared boards, and picks the copy once one is imported', async () => {
    listWithPresetDrafts.mockReturnValue(of([imported('i1', 'alex')]));

    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.sourceKind.set('imported');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-share-import')).not.toBeNull();
    expect(component.selection()).toEqual({ kind: 'board', id: 'i1' });

    listWithPresetDrafts.mockReturnValue(
      of([
        imported('i1', 'alex'),
        { ...imported('i9', 'bulle'), updatedAt: '2026-07-01T00:00:00Z' },
      ]),
    );
    component.sourceKind.set('preset');
    component.onImported('i9');
    await fixture.whenStable();

    expect(component.sourceKind()).toEqual('imported');
    expect(component.selection()).toEqual({ kind: 'board', id: 'i9' });
  });

  it('leads with the drafts, and drops their sources out of the rows below', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([summary('p1', 'projection', 'in_progress'), summary('p2', 'projection', 'none')]),
    );

    const fixture = await renderFixture();
    fixture.point.componentInstance.sourceKind.set('projection');
    fixture.detectChanges();

    expect(texts(fixture, '.section-title')).toEqual(['Your drafts', 'Start a new draft']);
    expect(texts(fixture, '.draft-name')).toEqual(['Projection p1']);
    expect(texts(fixture, '.row-name')).toEqual(['Projection p2']);
  });

  // The card is the button. A "Resume draft" on every card was a column of buttons before the
  // page had asked its second question; the one filled button on the page is Start.
  it('opens a draft from its card, worded by its state, with no button of its own', async () => {
    listWithPresetDrafts.mockReturnValue(
      of([
        summary('p1', 'projection', 'in_progress'),
        summary('p2', 'projection', 'finished', '2026-06-20T00:00:00Z'),
      ]),
    );

    const fixture = await renderFixture();

    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('.draft-open') as NodeListOf<HTMLButtonElement>,
    );
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Resume draft: Projection p1',
      'View summary: Projection p2',
    ]);
    expect(texts(fixture, '.draft-status')).toEqual(['In progress', 'Complete']);
    expect(fixture.nativeElement.querySelectorAll('.draft .btn')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('.btn-primary')).toHaveLength(1);

    cards[1].click();

    expect(navigate).toHaveBeenCalledWith(['/projections', 'p2', 'draft']);
  });

  it('keeps the discard behind the card menu rather than on the card', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'in_progress')]));

    const fixture = await renderFixture();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.draft button') as NodeListOf<HTMLElement>,
    ).map((button) => button.className);
    expect(buttons).toEqual(['draft-open', 'draft-menu']);

    (fixture.nativeElement.querySelector('.draft-menu') as HTMLElement).click();

    const items = Array.from(menuPanel()?.querySelectorAll('.menu-item') ?? []).map((item) =>
      item.textContent?.trim(),
    );
    expect(items).toEqual(['Open the projection', 'Discard draft']);
    expect(menuPanel()?.querySelector('.discard')?.classList.contains('menu-item--danger')).toBe(
      true,
    );
  });

  // The board is the picks and nothing else, and it is not in "Your projection" to open.
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

    expect(texts(fixture, '.draft-actions button')).toEqual(['Yes, discard', 'Cancel']);
    expect(texts(fixture, '.confirm-text')).toEqual(['Discard the picks? The projection stays.']);
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
    component.sourceKind.set('projection');
    fixture.detectChanges();

    expect(clearDraft).toHaveBeenCalledWith('p1');
    expect(fixture.nativeElement.querySelector('.draft')).toBeNull();
    expect(texts(fixture, '.row-name')).toEqual(['Projection p1']);
    expect(component.selection()).toEqual({ kind: 'board', id: 'p1' });
  });

  // The empty state links to the new-projection page; a list that is not empty used to lose
  // that door, though it is the only way to more projections from here.
  it('keeps the way to a new projection beside the projections already listed', async () => {
    listWithPresetDrafts.mockReturnValue(of([summary('p1', 'projection', 'none')]));

    const fixture = await renderFixture();
    fixture.point.componentInstance.sourceKind.set('projection');
    fixture.detectChanges();

    // RouterLink is mocked away with the rest of the router here, so the anchor carries no
    // href; the directive's input is what says where it goes.
    const link = ngMocks.find(fixture, '.create-projection');

    expect(ngMocks.input(link, 'routerLink')).toEqual('/projections/new');
    expect(link.nativeElement.textContent?.trim()).toEqual('+ Create a new projection');
  });

  /**
   * Locked, not hidden. Someone who cannot see the AI projection has no reason to buy it, so
   * the card keeps its place among the presets and the padlock and the button say the rest.
   */
  describe('when the AI projection is behind a subscription', () => {
    const withPayments = async (
      test: (fixture: Awaited<ReturnType<typeof renderFixture>>) => void,
    ) => {
      const original = environment.paymentsEnabled;
      environment.paymentsEnabled = true;
      try {
        test(await renderFixture());
      } finally {
        environment.paymentsEnabled = original;
      }
    };

    it('keeps the card on the page, marked and locked', async () => {
      await withPayments((fixture) => {
        const component = fixture.point.componentInstance;

        expect(component.isPresetLocked(MODEL)).toBe(true);
        expect(component.isPresetLocked(LAST_SEASON)).toBe(false);
        // Still listed, still named, still one of the two starting points on offer.
        expect(texts(fixture, '.row-name')).toEqual([LAST_SEASON_PRESET_NAME, MODEL_PRESET_NAME]);
        expect(fixture.nativeElement.querySelectorAll('.row--locked').length).toEqual(1);
      });
    });

    /**
     * The Start button is the page's one primary action. Over a locked preset it could only
     * produce a refusal, so it becomes the thing that can actually be done next.
     */
    it('turns the Start button into the way to Premium once the locked card is picked', async () => {
      await withPayments((fixture) => {
        const component = fixture.point.componentInstance;
        component.selectPreset(MODEL);
        fixture.detectChanges();

        expect(component.selectionLocked()).toBe(true);
        const link = fixture.nativeElement.querySelector('.start-row a');
        expect(link?.textContent?.trim()).toEqual('Unlock with Premium');
        expect(link?.getAttribute('routerLink')).toEqual('/pricing');
        expect(fixture.nativeElement.querySelector('.start-row button')).toBeNull();
      });
    });

    it('leaves the free preset able to start a draft as it always could', async () => {
      await withPayments((fixture) => {
        const component = fixture.point.componentInstance;
        component.selectPreset(LAST_SEASON);
        fixture.detectChanges();

        expect(component.selectionLocked()).toBe(false);
        expect(
          fixture.nativeElement.querySelector('.start-row button')?.textContent?.trim(),
        ).toEqual('Start draft');
      });
    });

    it('unlocks the card for a subscriber, badge and all', async () => {
      premium.set(true);
      await withPayments((fixture) => {
        expect(fixture.point.componentInstance.isPresetLocked(MODEL)).toBe(false);
        expect(fixture.nativeElement.querySelector('.row--locked')).toBeNull();
        // The badge stays: it names the plan the starting point belongs to.
        expect(texts(fixture, '.row-badge')).toEqual(['Premium']);
      });
    });

    /**
     * A lapsed subscription is the one way to reach the server's refusal from this page, and
     * "please try again" over it would send someone at something that cannot work.
     */
    it('says what a refused draft actually needs, rather than telling anyone to retry', async () => {
      createProjection.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      const component = await render();

      component.startPreset(MODEL);

      expect(notifyError).toHaveBeenCalledWith(expect.stringContaining('part of Premium'));
      expect(notifyError).not.toHaveBeenCalledWith(expect.stringContaining('try again'));
    });
  });
});
