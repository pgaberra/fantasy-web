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
import { HttpErrorResponse } from '@angular/common/http';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { Preset, presetById, PRESETS } from '../models/preset';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { PopoverTriggerDirective } from '../shared/popover/popover-trigger.directive';
import { OpenPopovers } from '../shared/popover/open-popovers';
import { ShareImportComponent } from '../shared/share-import/share-import';
import { FeatureService } from '../services/feature.service';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { isFollowedBoard, isOwnBoard, SOURCE_KINDS, SourceKind } from '../models/source-kind';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/icon/icon';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';

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
 * specific one, then a single Start button.
 *
 * <p>A source may hold any number of drafts — a draft is a row of its own, holding a copy of what
 * it was started against — so the two lists are about different things rather than two views of
 * one: above, the drafts that exist; below, what a new one would be drafted against. Starting a
 * second draft off a projection is pressing Start again.
 *
 * <p>Nothing is saved from here, and nothing about the league is asked: the draft page's setup
 * asks how the league scores, the teams and the order, and only then creates the draft, so a setup
 * someone backs out of leaves nothing behind.
 */
@Component({
  selector: 'app-draft-start',
  imports: [
    TooltipDirective,
    RouterLink,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    PopoverTriggerDirective,
    ShareImportComponent,
    IconComponent,
  ],
  templateUrl: './draft-start.html',
  styleUrl: './draft-start.css',
})
export class DraftStartComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly aiAccess = inject(AiProjectionAccess);
  private readonly features = inject(FeatureService);
  private readonly openPopovers = inject(OpenPopovers);

  private readonly confirmPrompt = viewChild<ElementRef<HTMLElement>>('confirmPrompt');

  readonly sourceKinds = SOURCE_KINDS;

  /**
   * The presets this environment offers. Filtered rather than constant: the BFF decides whether
   * it serves the AI projection, and a row that starts a draft the server will not seed is worse
   * than no row.
   */
  readonly presets = computed(() => this.features.offeredPresets(PRESETS));

  readonly sourcesResource = rxResource({
    stream: () => this.storage.listAll(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  /** Which draft is being asked about, so two rows cannot share one confirmation. */
  readonly confirmingDiscard = signal<string | null>(null);
  /** The draft being thrown away, so its row says so and cannot be pressed a second time. */
  readonly discarding = signal<string | null>(null);

  /** Which draft is being named, so two rows cannot be open for renaming at once. */
  readonly renamingDraft = signal<string | null>(null);
  readonly renameValue = signal<string>('');
  readonly renameSaving = signal<boolean>(false);
  readonly renameError = signal<string | null>(null);

  /**
   * Every draft the user has, unfinished first and newest first within that. Resuming one is
   * what most visits here are for, so it leads the page.
   */
  readonly drafts = computed(() => {
    const unfinishedFirst = (draft: ProjectionSummaryResponse) =>
      draft.draftStatus === 'in_progress' ? 0 : 1;
    return this.sourcesResource
      .value()
      .filter((projection) => projection.kind === 'draft')
      .sort(
        (first, second) =>
          unfinishedFirst(first) - unfinishedFirst(second) ||
          second.updatedAt.localeCompare(first.updatedAt),
      );
  });

  /**
   * The boards, whether or not they have been drafted against: every one can be, again. Split on
   * who owns them: the user's own (built, copied, or uploaded from a spreadsheet) and the ones
   * they follow.
   */
  readonly projections = computed(() => this.boardsMatching(isOwnBoard));
  readonly followed = computed(() => this.boardsMatching(isFollowedBoard));

  /**
   * Every preset this environment offers. A preset that has been drafted against is still on
   * offer: drafting last season's numbers a second time is a reasonable thing to want, and the
   * draft it produced is its own row above rather than something occupying the preset.
   */
  readonly availablePresets = this.presets;

  /**
   * A preset the link asked for (`?start=model`, from the home page's AI projection card). Read
   * once: it decides the kind the page opens on as well as the row picked in it.
   */
  private readonly linkedPreset = presetById(
    (this.route.snapshot.queryParams['start'] as string | undefined) ?? null,
  );

  /**
   * The kind the page opens on: the user's own boards if they have any, else the ones they
   * follow, else the presets, which need nothing prepared. What the user built is what they came
   * to draft against; a preset is the way in for someone who has nothing yet. A link naming a
   * preset overrides all of it. A computed rather than read inline, so the tile below only
   * re-derives when this answer actually changes, and a kind the user picked survives a reload of
   * the lists that leaves the answer where it was.
   */
  private readonly defaultKind = computed<SourceKind>(() => {
    if (this.linkedPreset) {
      return 'preset';
    }
    if (this.projections().length > 0) {
      return 'projection';
    }
    return this.followed().length > 0 ? 'following' : 'preset';
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
    const wanted = this.linkedPreset;
    if (wanted) {
      const pending = effect(() => {
        const offered = this.availablePresets().find((preset) => preset.id === wanted.id);
        if (offered) {
          this.sourceKind.set('preset');
          this.selectPreset(offered);
          pending.destroy();
        }
      });
    }
  }

  draftLabel(status: ProjectionSummaryResponse['draftStatus']): string {
    return status === 'finished' ? 'View summary' : 'Resume draft';
  }

  /** Whose numbers a row holds, said in the row rather than only by the heading above it. */
  sourceLabel(projection: ProjectionSummaryResponse): string {
    if (projection.kind === 'draft') {
      return this.draftSourceLabel(projection);
    }
    // An origin is what a follow has and nothing else does: a copy taken from a link is the
    // user's own projection and carries none, and neither does a spreadsheet import.
    if (projection.origin) {
      return `Following ${projection.origin.authorUsername}`;
    }
    return projection.kind === 'imported' ? 'From a spreadsheet' : 'Your projection';
  }

  /**
   * What a draft was started against. Named rather than merely referred to, since a draft can be
   * renamed — after a league sync it is — and the name then no longer says it.
   *
   * <p>Empty where it would only repeat the draft's own name, which is every draft still called
   * after what it was started from. A board that has since been deleted leaves the draft
   * standing, holding its own copy of the numbers; there is simply nothing left to name.
   */
  private draftSourceLabel(draft: ProjectionSummaryResponse): string {
    const source = draft.preset
      ? (presetById(draft.preset)?.name ?? null)
      : (this.sourceBoard(draft)?.name ?? null);
    if (source === null) {
      return draft.preset ? '' : 'Projection deleted';
    }
    return draft.name === source ? '' : `From ${source}`;
  }

  private sourceBoard(draft: ProjectionSummaryResponse): ProjectionSummaryResponse | null {
    const id = draft.sourceProjectionId;
    return id ? (this.sourcesResource.value().find((board) => board.id === id) ?? null) : null;
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

  /**
   * The one Start on the page, and it always starts a new draft — against a preset or against a
   * board. Nothing is saved yet: the draft page asks for the teams and the order first and only
   * then creates the draft, so backing out of that setup leaves nothing behind.
   */
  start(): void {
    const chosen = this.selection();
    if (!chosen) {
      return;
    }
    void this.router.navigate(
      chosen.kind === 'preset'
        ? ['/draft/new/preset', chosen.preset.id]
        : ['/draft/new/board', chosen.id],
    );
  }

  /** Only where the board it was started from is still there to open. */
  canOpenBoard(draft: ProjectionSummaryResponse): boolean {
    return this.sourceBoard(draft) !== null;
  }

  openBoard(draft: ProjectionSummaryResponse): void {
    const board = this.sourceBoard(draft);
    if (board) {
      void this.router.navigate(['/projections', board.id]);
    }
  }

  retry(): void {
    this.sourcesResource.reload();
  }

  /**
   * Opens a draft that exists: its own address, which is not the board's. A finished draft opens
   * on its summary — what it came to is what there is to see — and the board is a click away from
   * there. One still being drafted opens on the board.
   */
  openDraft(draft: ProjectionSummaryResponse): void {
    const path =
      draft.draftStatus === 'finished' ? ['/drafts', draft.id, 'summary'] : ['/drafts', draft.id];
    void this.router.navigate(path);
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

  isRenaming(draft: ProjectionSummaryResponse): boolean {
    return this.renamingDraft() === draft.id;
  }

  requestRename(draft: ProjectionSummaryResponse): void {
    this.openPopovers.closeAll();
    this.renameValue.set(draft.name);
    this.renameError.set(null);
    this.renamingDraft.set(draft.id);
  }

  cancelRename(): void {
    this.renamingDraft.set(null);
    this.renameError.set(null);
  }

  onRenameInput(event: Event): void {
    this.renameValue.set((event.target as HTMLInputElement).value);
  }

  /**
   * Names a draft from the list, which is where ten drafts off one projection are told apart. A
   * name another draft holds is refused rather than numbered: it is the whole of what was asked
   * for here, unlike the name a sync or a create settles on its own.
   */
  saveRename(draft: ProjectionSummaryResponse): void {
    const name = this.renameValue().trim();
    if (this.renameSaving()) {
      return;
    }
    if (!name) {
      this.renameError.set('Name cannot be empty.');
      return;
    }
    if (name === draft.name) {
      this.cancelRename();
      return;
    }
    this.renameSaving.set(true);
    this.renameError.set(null);
    this.storage
      .renameProjection(draft.id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.renameSaving.set(false);
          this.renamingDraft.set(null);
          this.sourcesResource.reload();
        },
        error: (error: unknown) => {
          this.renameSaving.set(false);
          const conflict = error instanceof HttpErrorResponse && error.status === 409;
          this.renameError.set(
            conflict ? 'You already have a draft with that name.' : "Couldn't rename the draft.",
          );
        },
      });
  }

  isConfirmingDiscard(draft: ProjectionSummaryResponse): boolean {
    return this.confirmingDiscard() === draft.id;
  }

  isDiscarding(draft: ProjectionSummaryResponse): boolean {
    return this.discarding() === draft.id;
  }

  /** What is actually lost. Never the board: the draft holds a copy of its own. */
  discardPrompt(draft: ProjectionSummaryResponse): string {
    return this.sourceBoard(draft)
      ? 'Discard this draft? The picks go, the projection stays.'
      : 'Discard this draft? Your picks will be lost.';
  }

  /**
   * Throws a draft away. The whole row goes: a draft holds nothing but its picks, its league and
   * a copy of the numbers it was played against, and the board those were copied from is a row of
   * its own that this never touches. Nothing is freed up by it either — the source it came from
   * was always available to be drafted again.
   *
   * <p>So the list is not read again once the server has said yes: nothing in it changes but the
   * one row, which is taken out where it stands.
   */
  confirmDiscard(draft: ProjectionSummaryResponse): void {
    this.confirmingDiscard.set(null);
    this.discarding.set(draft.id);
    const discarded: Observable<unknown> = this.storage.deleteProjection(draft.id);
    discarded.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.discarding.set(null);
        this.sourcesResource.update((sources) =>
          sources.filter((source) => source.id !== draft.id),
        );
      },
      error: () => {
        this.discarding.set(null);
        this.notification.error("Couldn't discard the draft. Please try again.");
      },
    });
  }

  /**
   * A board just followed is something to draft against. It is checked before the list that will
   * hold it has been re-read: `selection` keeps a pick whose row turns up in the reload, so it is
   * what Start drafts against the moment it appears, rather than whichever board was first.
   */
  onFollowed(id: string): void {
    this.pickBoard('following', id);
  }

  private pickBoard(kind: SourceKind, id: string): void {
    this.sourceKind.set(kind);
    this.selection.set({ kind: 'board', id });
    this.sourcesResource.reload();
  }

  private optionsOf(kind: SourceKind): readonly DraftSource[] {
    switch (kind) {
      case 'preset':
        return this.presets().map((preset) => ({ kind: 'preset', preset }));
      case 'projection':
        return this.projections().map((projection) => ({ kind: 'board', id: projection.id }));
      case 'following':
        return this.followed().map((board) => ({ kind: 'board', id: board.id }));
    }
  }

  private boardsMatching(
    belongsHere: (projection: ProjectionSummaryResponse) => boolean,
  ): ProjectionSummaryResponse[] {
    return this.sourcesResource
      .value()
      .filter((projection) => projection.kind !== 'draft' && belongsHere(projection))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }
}

function sameSource(first: DraftSource, second: DraftSource): boolean {
  if (first.kind === 'preset' && second.kind === 'preset') {
    return first.preset.id === second.preset.id;
  }
  return first.kind === 'board' && second.kind === 'board' && first.id === second.id;
}
