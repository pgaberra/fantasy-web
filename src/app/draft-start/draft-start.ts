import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { StatInfoService } from '../services/stat-info.service';
import { ProjectionResponse } from '../api/models/projection-response';
import { createDefaultProjectionState } from '../draft-projection/projection-defaults';
import { NotificationService } from '../services/notification.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { Preset, presetById, PRESETS } from '../models/preset';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { PopoverTriggerDirective } from '../shared/popover/popover-trigger.directive';
import { OpenPopovers } from '../shared/popover/open-popovers';
import { ProjectionImportComponent } from '../shared/projection-import/projection-import';
import { FeatureService } from '../services/feature.service';
import {
  PreviewSource,
  StartingPointPreviewComponent,
} from '../shared/starting-point-preview/starting-point-preview';
import { ProjectionBoardCache } from '../services/projection-board-cache';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { SOURCE_KINDS, SourceKind } from '../models/source-kind';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/icon/icon';
import {
  DRAFT_LEAGUE_STATE_KEY,
  draftSettingsOf,
  LeagueSettings,
  leagueSettingsOf,
  NO_PAGE_LEAGUES,
  PageLeagues,
  pageLeagueFor,
  withPageLeague,
} from '../shared/league-settings/league-settings';
import { ScoringStatKey } from '../models/stat-key.model';
import { LeagueSettingsControlsComponent } from '../shared/league-settings-controls/league-settings-controls';

/**
 * The one thing the Start button will draft against. A preset is seeded on the server the
 * moment it is started; a board, the user's own or a copy of someone else's, already exists.
 */
export type DraftSource =
  | { readonly kind: 'preset'; readonly preset: Preset }
  | { readonly kind: 'board'; readonly id: string };

/**
 * Picks what a draft is drafted against: one of the user's own projections, a board copied from
 * someone's share link, or a preset.
 *
 * <p>The page asks two questions in that order, and every row belongs to exactly one of them.
 * "Your drafts" is every draft that exists, whatever it was started against, each a card that
 * opens it. "Start a new draft" is a choice made in steps: the kind of source first, then the
 * specific one, then a single Start button. It used to be every source at once, each with a
 * button of its own, and a page of eight identical buttons gave no sense of what to do first.
 * The kind is chosen with a tile, and only that kind's rows are on the page; the tiles say what
 * each holds, so nothing is hidden, only folded.
 *
 * <p>A source holds at most one draft, so lifting the drafts out leaves the rows below meaning
 * exactly one thing, "not started yet", and nothing on the page is rendered twice.
 *
 * <p>A preset draft has no projection behind it, so it is saved as a projection of its own kind —
 * seeded server-side from the same read model a new projection starts from — purely to hold the
 * picks. It never shows up under "Your projection". That board is created by the draft page once
 * its setup is confirmed, not by Start here, so a setup someone backs out of saves nothing.
 */
@Component({
  selector: 'app-draft-start',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    PopoverTriggerDirective,
    ProjectionImportComponent,
    IconComponent,
    StartingPointPreviewComponent,
    LeagueSettingsControlsComponent,
  ],
  templateUrl: './draft-start.html',
  styleUrl: './draft-start.css',
  // The preview inside this page loads boards through it. Page-scoped, so a board edited in the
  // editor is drawn as it is now rather than as this page last saw it.
  providers: [ProjectionBoardCache],
})
export class DraftStartComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly aiAccess = inject(AiProjectionAccess);
  private readonly features = inject(FeatureService);
  private readonly boardCache = inject(ProjectionBoardCache);
  private readonly openPopovers = inject(OpenPopovers);

  private readonly confirmPrompt = viewChild<ElementRef<HTMLElement>>('confirmPrompt');

  readonly sourceKinds = SOURCE_KINDS;

  /**
   * The presets this environment offers. What the page offers is `availablePresets`, the ones
   * with no draft yet. Filtered rather than constant: the BFF decides whether it serves the AI
   * projection, and a row that starts a draft the server will not seed is worse than no row.
   */
  readonly presets = computed(() => this.features.offeredPresets(PRESETS));

  readonly sourcesResource = rxResource({
    stream: () => this.storage.listWithPresetDrafts(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  /** Which draft is being asked about, so two rows cannot share one confirmation. */
  readonly confirmingDiscard = signal<string | null>(null);
  /** The draft being thrown away, so its row says so and cannot be pressed a second time. */
  readonly discarding = signal<string | null>(null);

  /**
   * Every draft the user has, unfinished first and newest first within that. Resuming one is
   * what most visits here are for, so it leads the page — and it is the only place a draft is
   * rendered, which is why the lists below drop the sources these were started from.
   */
  readonly drafts = computed(() => {
    const unfinishedFirst = (draft: ProjectionSummaryResponse) =>
      draft.draftStatus === 'in_progress' ? 0 : 1;
    return this.sourcesResource
      .value()
      .filter((projection) => projection.draftStatus !== 'none')
      .sort(
        (first, second) =>
          unfinishedFirst(first) - unfinishedFirst(second) ||
          second.updatedAt.localeCompare(first.updatedAt),
      );
  });

  readonly projections = computed(() => this.undrafted('projection'));
  readonly imported = computed(() => this.undrafted('imported'));

  /**
   * The stored draft for each preset. Absent until one has been started.
   *
   * <p>A draft saved before the server recorded the preset has none; every one of those came
   * from last season's stats, which is what the migration that added the field gave them, and
   * what this falls back to for anything still in flight.
   */
  private readonly presetDrafts = computed(() => {
    const byPreset = new Map<Preset['id'], ProjectionSummaryResponse>();
    for (const projection of this.sourcesResource.value()) {
      if (projection.kind === 'preset_draft') {
        byPreset.set(projection.preset ?? 'last_season', projection);
      }
    }
    return byPreset;
  });

  /**
   * The presets still on offer. One that has been drafted against is represented by its draft
   * above, and discarding that draft is what brings the row back — so leaving it here would put
   * a second entry point on the page for a draft that already exists, which is the duplication
   * this picker had everywhere.
   *
   * <p>"Drafted against" is the same test `drafts` lists by, not merely "has a board". Start used
   * to seed the board before the draft page's setup had been saved, and someone who backed out of
   * that setup left a board in neither list; filtering on the board alone made the preset vanish
   * from the page for good. Boards are now created only once the setup is confirmed, but one left
   * from before still keeps the preset on offer, and `startPreset` opens it.
   */
  readonly availablePresets = computed(() =>
    this.presets().filter((preset) => (this.presetDraft(preset)?.draftStatus ?? 'none') === 'none'),
  );

  /**
   * The kind the page opens on: the first with something in it, presets ahead of the rest since
   * they are the way in that needs nothing prepared. A computed rather than read inline, so the
   * tile below only re-derives when this answer actually changes, and a kind the user picked
   * survives a reload of the lists that leaves the answer where it was.
   */
  private readonly defaultKind = computed<SourceKind>(() => {
    if (this.availablePresets().length > 0) {
      return 'preset';
    }
    return this.projections().length > 0 ? 'projection' : 'imported';
  });

  /** The tile that is down: which of the three kinds the rows below are showing. */
  readonly sourceKind = linkedSignal<SourceKind, SourceKind>({
    source: this.defaultKind,
    computation: (kind) => kind,
  });

  /**
   * What Start will draft against. The first row of the chosen kind is picked as soon as the
   * kind is, so a draft is always one press away; a pick the user made survives the lists
   * reloading for as long as its row is still there.
   */
  readonly selection = linkedSignal<
    { kind: SourceKind; options: readonly DraftSource[] },
    DraftSource | null
  >({
    source: () => ({ kind: this.sourceKind(), options: this.optionsOf(this.sourceKind()) }),
    computation: ({ options }, previous) => {
      const kept = previous?.value;
      if (kept && options.some((option) => sameSource(option, kept))) {
        return kept;
      }
      return options[0] ?? null;
    },
  });

  constructor() {
    // The menu that asked is closed by then, so focus would otherwise be left on the body. The
    // prompt takes it rather than the "Yes" beside it: the keypress that picked the menu item
    // must not be able to carry through and confirm.
    effect(() => {
      if (this.confirmingDiscard()) {
        this.confirmPrompt()?.nativeElement.focus();
      }
    });

    // A preset a link asked for (`?start=model`, from the home page's AI projection card) is
    // picked once its row is there to pick. Not at once: the AI preset is offered only after the
    // BFF has said it serves the model, and `selection` falls back to the first row whenever the
    // picked one is not among the options, so an early pick would be undone by that answer.
    // A preset already drafted against has no row; its draft card leads the page instead, so the
    // wait ends there without picking anything, and discarding that draft later does not pick it.
    const wanted = presetById(
      (this.route.snapshot.queryParams['start'] as string | undefined) ?? null,
    );
    if (wanted) {
      const pending = effect(() => {
        if (this.sourcesResource.isLoading() || !this.sourcesResource.hasValue()) {
          return;
        }
        const offered = this.availablePresets().find((preset) => preset.id === wanted.id);
        if (offered) {
          this.sourceKind.set('preset');
          this.selectPreset(offered);
          pending.destroy();
        } else if (this.presetDraft(wanted)) {
          pending.destroy();
        }
      });
    }
  }

  presetDraft(preset: Preset): ProjectionSummaryResponse | null {
    return this.presetDrafts().get(preset.id) ?? null;
  }

  draftLabel(status: ProjectionSummaryResponse['draftStatus']): string {
    return status === 'finished' ? 'View summary' : 'Resume draft';
  }

  /** Whose numbers a row holds, said in the row rather than only by the heading above it. */
  sourceLabel(projection: ProjectionSummaryResponse): string {
    if (projection.kind === 'preset_draft') {
      return 'Preset';
    }
    if (projection.origin) {
      return `From ${projection.origin.authorUsername}`;
    }
    // An imported board with nobody to credit came from a spreadsheet rather than a share link.
    return projection.kind === 'imported' ? 'From a spreadsheet' : 'Your projection';
  }

  /** What the timestamp beside it means, which differs for a draft still being made. */
  timingLabel(draft: ProjectionSummaryResponse): string {
    return draft.draftStatus === 'finished' ? 'finished' : 'last pick';
  }

  /**
   * Whether to mark a preset as Premium. Only where payments exist: without them the AI
   * projection is free and ungated, and a badge advertising a subscription the build cannot
   * sell is a promise nobody can act on. Gated on the same flag as the Premium and checkout
   * routes, so the payments story appears and disappears in one piece.
   */
  showsPremiumBadge(preset: Preset): boolean {
    return !!preset.premium && environment.paymentsEnabled;
  }

  /**
   * Whether this account would have to subscribe before it could draft against a preset. The
   * card stays where it is and stays pickable: picking it is how someone reads what it is and
   * finds the way to it, and a starting point nobody can look at sells nothing.
   */
  isPresetLocked(preset: Preset): boolean {
    return !!preset.premium && this.aiAccess.locked();
  }

  /** The league a new preset draft is ranked by until someone changes it: a new projection's. */
  private readonly defaultLeague = leagueSettingsOf(
    createDefaultProjectionState((key) => this.statInfoService.isRateStat(key)),
  );

  /**
   * The picked board, for the league it is ranked by. Through the page's cache, which the preview
   * reads the same board from, so picking one is still one download.
   */
  private readonly pickedBoard = rxResource({
    params: () => {
      const chosen = this.selection();
      return chosen?.kind === 'board' ? chosen.id : undefined;
    },
    stream: ({ params: id }) => this.boardCache.load(id),
    defaultValue: undefined as ProjectionResponse | undefined,
  });

  /**
   * The leagues set on this page. A hand edit is kept per source rather than as one league for the
   * page: a board already carries a league of its own, and switching to it and back must neither
   * lose the one set for the presets nor lay that one over the board. The presets share one, since
   * they differ only in their numbers. An import is the page's: it says which league the user
   * plays in, so a board is drafted against it as much as a preset is.
   */
  private readonly changedLeagues = signal<PageLeagues>(NO_PAGE_LEAGUES);

  /**
   * What a source opens with — a new projection's defaults for a preset, a board's own settings
   * for a board — or null while that board is still on its way.
   */
  private openingLeague(source: DraftSource): LeagueSettings | null {
    if (source.kind === 'preset') {
      return this.defaultLeague;
    }
    const board = this.pickedBoard.hasValue() ? this.pickedBoard.value() : undefined;
    return board?.id === source.id
      ? leagueSettingsOf(this.serializer.fromProjectionData(board.data))
      : null;
  }

  /** The league set on this page for a source, or undefined when it opens as it is. */
  private changedLeague(source: DraftSource): LeagueSettings | undefined {
    return pageLeagueFor(this.changedLeagues(), sourceKey(source), this.openingLeague(source));
  }

  /**
   * The league the picked source will be drafted with: what was set here, or else what it opens
   * with. Null while a picked board is still on its way, which holds the controls back rather than
   * showing defaults that would jump the moment it lands.
   */
  readonly leagueSettings = computed<LeagueSettings | null>(() => {
    const chosen = this.selection();
    return chosen ? (this.changedLeague(chosen) ?? this.openingLeague(chosen)) : null;
  });

  setLeagueSettings(settings: LeagueSettings): void {
    const chosen = this.selection();
    if (!chosen) {
      return;
    }
    const previous = this.leagueSettings();
    this.changedLeagues.update((leagues) =>
      withPageLeague(leagues, sourceKey(chosen), previous, settings),
    );
  }

  setStatWeights(statWeights: Record<ScoringStatKey, number>): void {
    const league = this.leagueSettings();
    if (league) {
      this.setLeagueSettings({ ...league, statWeights });
    }
  }

  /**
   * What the preview draws: whatever is picked. Null when the open kind holds nothing, where the
   * panel's own empty state is the whole answer and a preview would only say so again.
   */
  readonly previewSource = computed<PreviewSource | null>(() => {
    const chosen = this.selection();
    if (!chosen) {
      return null;
    }
    if (chosen.kind === 'board') {
      return { kind: 'board', id: chosen.id };
    }
    const preset = chosen.preset.source;
    return preset ? { kind: 'preset', preset } : null;
  });

  /**
   * What the preview says when a board will not download. The page knows its name, and naming
   * what a draft would be run against beats the preview's own "unavailable".
   */
  readonly previewFallbackNote = computed<string | null>(() => {
    const chosen = this.selection();
    if (chosen?.kind !== 'board') {
      return null;
    }
    const board = this.sourcesResource.value().find((source) => source.id === chosen.id);
    return board ? `Drafts against ${board.name}, using its saved numbers.` : null;
  });

  /** Whether what is picked right now is behind the subscription, so the Start button is not it. */
  readonly selectionLocked = computed(() => {
    const chosen = this.selection();
    return chosen?.kind === 'preset' && this.isPresetLocked(chosen.preset);
  });

  /**
   * How many choices a kind holds, shown on its segment so the two kinds not open are still
   * accounted for on the page. A bare number: a segment has room for "Preset 2", not for the
   * sentence a tile used to carry, and the panel's empty state says the rest when it is 0.
   */
  kindCount(kind: SourceKind): number {
    return this.optionsOf(kind).length;
  }

  isPresetSelected(preset: Preset): boolean {
    const chosen = this.selection();
    return chosen?.kind === 'preset' && chosen.preset.id === preset.id;
  }

  isBoardSelected(id: string): boolean {
    const chosen = this.selection();
    return chosen?.kind === 'board' && chosen.id === id;
  }

  selectPreset(preset: Preset): void {
    this.selection.set({ kind: 'preset', preset });
  }

  selectBoard(id: string): void {
    this.selection.set({ kind: 'board', id });
  }

  /** The one Start on the page: seeds a preset, or opens the board that is already there. */
  start(): void {
    const chosen = this.selection();
    if (!chosen) {
      return;
    }
    if (chosen.kind === 'preset') {
      this.startPreset(chosen.preset);
    } else {
      this.openDraft(chosen.id, this.changedLeague(chosen));
    }
  }

  /** Only a board that exists on its own: a preset draft holds nothing but its picks. */
  canOpenBoard(draft: ProjectionSummaryResponse): boolean {
    return draft.kind !== 'preset_draft';
  }

  openBoard(id: string): void {
    void this.router.navigate(['/projections', id]);
  }

  retry(): void {
    this.sourcesResource.reload();
  }

  /**
   * Opens a board's draft page. A league set here goes with it in the navigation's state, for the
   * draft to be created with: it is the draft's own, and the board is never written to.
   */
  openDraft(id: string, league?: LeagueSettings): void {
    this.navigateWithLeague(['/projections', id, 'draft'], league);
  }

  /**
   * The kebab stays on the card while the question is asked, unlike the projection list's, which
   * is replaced by it. Nothing else would close the menu: the click was inside it, and it would
   * be left hanging over the "Yes, discard" it just raised.
   */
  requestDiscard(draft: ProjectionSummaryResponse): void {
    this.openPopovers.closeAll();
    this.confirmingDiscard.set(draft.id);
  }

  cancelDiscard(): void {
    this.confirmingDiscard.set(null);
  }

  isConfirmingDiscard(draft: ProjectionSummaryResponse): boolean {
    return this.confirmingDiscard() === draft.id;
  }

  isDiscarding(draft: ProjectionSummaryResponse): boolean {
    return this.discarding() === draft.id;
  }

  /** What is actually lost, which is not the same thing for a preset draft as for a board. */
  discardPrompt(draft: ProjectionSummaryResponse): string {
    return draft.kind === 'preset_draft'
      ? 'Discard this draft? Your picks will be lost.'
      : 'Discard the picks? The projection will stay.';
  }

  /**
   * Throws a draft away. A preset draft holds nothing but its picks and its rows are the same
   * for everyone, so the whole thing goes and the preset returns to the list below ready to be
   * started fresh, which is what the "Start over" button beside it used to mean. A draft against
   * a projection or an imported board is cleared out of it instead: the board is the user's own
   * work and has to survive losing the picks made against it.
   */
  confirmDiscard(draft: ProjectionSummaryResponse): void {
    this.confirmingDiscard.set(null);
    this.discarding.set(draft.id);
    // Typed here because the two branches return different things and neither matters: one
    // deletes, the other saves the projection back without its draft.
    const discarded: Observable<unknown> =
      draft.kind === 'preset_draft'
        ? this.storage.deleteProjection(draft.id)
        : this.storage.clearDraft(draft.id);
    discarded.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.discarding.set(null);
        this.sourcesResource.reload();
      },
      error: () => {
        this.discarding.set(null);
        this.notification.error("Couldn't discard the draft. Please try again.");
      },
    });
  }

  /**
   * The copy is the user's board now. It is checked before the list that will hold it has been
   * re-read: `selection` keeps a pick whose row turns up in the reload, so the copy is what
   * Start drafts against the moment it appears, rather than whichever board was first before.
   */
  onImported(id: string): void {
    this.sourceKind.set('imported');
    this.selection.set({ kind: 'board', id });
    this.sourcesResource.reload();
  }

  startPreset(preset: Preset): void {
    // The row is only offered while the preset has no draft; this covers one started elsewhere
    // since the list was read, which would otherwise try to save a second board for the same
    // preset, and a board left without a draft from before boards waited for the setup.
    const existing = this.presetDraft(preset);
    const changed = this.changedLeague({ kind: 'preset', preset });
    if (existing) {
      this.openDraft(existing.id, changed);
      return;
    }
    // Nothing is saved yet: the draft page asks for the teams and order first and only then
    // creates the board, so backing out of that setup leaves nothing behind.
    this.navigateWithLeague(['/draft/new', preset.id], changed);
  }

  private navigateWithLeague(path: string[], league: LeagueSettings | undefined): void {
    if (league) {
      void this.router.navigate(path, {
        state: { [DRAFT_LEAGUE_STATE_KEY]: draftSettingsOf(league) },
      });
    } else {
      void this.router.navigate(path);
    }
  }

  private optionsOf(kind: SourceKind): readonly DraftSource[] {
    switch (kind) {
      case 'preset':
        return this.availablePresets().map((preset) => ({ kind: 'preset', preset }));
      case 'projection':
        return this.projections().map((projection) => ({ kind: 'board', id: projection.id }));
      case 'imported':
        return this.imported().map((board) => ({ kind: 'board', id: board.id }));
    }
  }

  private undrafted(kind: ProjectionSummaryResponse['kind']): ProjectionSummaryResponse[] {
    return this.sourcesResource
      .value()
      .filter((projection) => projection.kind === kind && projection.draftStatus === 'none')
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }
}

/** What a league changed on this page is filed under: the presets together, each board apart. */
function sourceKey(source: DraftSource): string {
  return source.kind === 'preset' ? 'preset' : `board:${source.id}`;
}

function sameSource(first: DraftSource, second: DraftSource): boolean {
  if (first.kind === 'preset' && second.kind === 'preset') {
    return first.preset.id === second.preset.id;
  }
  return first.kind === 'board' && second.kind === 'board' && first.id === second.id;
}
