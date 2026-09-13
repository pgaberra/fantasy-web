import {
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnalyticsService } from '../services/analytics.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { StatInfoService } from '../services/stat-info.service';
import { PlayerService } from '../services/player.service';
import {
  PreviewSource,
  StartingPointPreviewComponent,
} from '../shared/starting-point-preview/starting-point-preview';
import { ProjectionBoardCache } from '../services/projection-board-cache';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionResponse } from '../api/models/projection-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionData } from '../api/models/projection-data';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { ShareImportComponent } from '../shared/share-import/share-import';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { createDefaultProjectionState } from '../draft-projection/projection-defaults';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionModelService } from '../services/projection-model.service';
import { freeProjectionName } from '../services/projection-name';
import { FeatureService } from '../services/feature.service';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { isPremiumRefusal, PREMIUM_REFUSED_MESSAGE } from '../shared/premium/premium-refused';
import { SOURCE_KINDS, SourceKind } from '../models/source-kind';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/icon/icon';

/**
 * What the projection opens with: a preset everybody has, or a copy of a board the user can
 * already open — one of their own, or one imported from someone's share link.
 *
 * <p>One value, not a group plus a preset plus a copy id. Split in three, two answers were held
 * at once and the visible group decided which of them the Create button used, so a copy picked
 * under one heading was discarded without a word by creating under another.
 */
export type StartingPoint =
  | { readonly kind: 'preset'; readonly source: NonNullable<CreateProjectionRequest['source']> }
  /**
   * A copy of a board. `id` is null only while the copy card is down and there is no board to
   * copy yet: the card is still the answer to "what kind", so it stays picked, but Create waits.
   */
  | { readonly kind: 'copy'; readonly id: string | null };

/** A starting point the server can derive on its own, from nothing the user has to supply. */
export interface CreatePreset {
  readonly name: string;
  readonly source: NonNullable<CreateProjectionRequest['source']>;
  /**
   * Sold as part of Premium. It marks the card and nothing else — `showsPremiumBadge` keeps the
   * mark out of a build that has no way to charge for it.
   */
  readonly premium?: boolean;
}

/** Every preset this page knows of. What it offers is `offeredPresets` of these — see below. */
export const CREATE_PRESETS: readonly CreatePreset[] = [
  { name: "Last season's stats", source: 'default' },
  { name: 'AI projection', source: 'model', premium: true },
  { name: 'From scratch', source: 'blank' },
];

@Component({
  selector: 'app-projection-create',
  imports: [
    LoadingIndicatorComponent,
    ErrorStateComponent,
    HelpTipComponent,
    RouterLink,
    StartingPointPreviewComponent,
    ShareImportComponent,
    RelativeTimePipe,
    IconComponent,
  ],
  templateUrl: './projection-create.html',
  styleUrl: './projection-create.css',
  // Shared with the preview inside this page, so picking a board and then creating from it
  // downloads it once. Page-scoped, so a board edited in the editor comes back changed.
  providers: [ProjectionBoardCache],
})
export class ProjectionCreateComponent {
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly playerService = inject(PlayerService);
  private readonly projectionModel = inject(ProjectionModelService);
  private readonly aiAccess = inject(AiProjectionAccess);
  private readonly features = inject(FeatureService);
  private readonly boardCache = inject(ProjectionBoardCache);

  private readonly preview = viewChild(StartingPointPreviewComponent);

  // Only the boards themselves are needed here: the player rows of a new projection are
  // filled in server-side from `source`, so this page no longer downloads every player just
  // to upload them straight back. Both kinds are listed — the user's own projections and the
  // ones they imported from a share link are each a starting point a copy can be made from.
  private readonly dataResource = rxResource({
    stream: () => this.projectionStorage.listEditable(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  /**
   * The presets this environment offers. Filtered rather than constant: the BFF decides whether
   * it serves the AI projection, and a row that seeds a projection the server will not fill in
   * is worse than no row.
   */
  readonly presets = computed(() => this.features.offeredPresets(CREATE_PRESETS));

  readonly sourceKinds = SOURCE_KINDS;

  /**
   * Which of the three kinds the cards below are showing. Opens on the presets: it is the group
   * that is never empty, and where most projections begin.
   */
  readonly sourceKind = signal<SourceKind>('preset');

  /**
   * The one answer the page holds, and the card that is checked. The first of the open kind is
   * picked as soon as the kind is, so Create is never a press away from nothing; a pick the user
   * made survives the list reloading for as long as its card is still there.
   */
  readonly startingPoint = linkedSignal<
    { kind: SourceKind; options: readonly StartingPoint[] },
    StartingPoint
  >({
    source: () => ({ kind: this.sourceKind(), options: this.optionsOf(this.sourceKind()) }),
    computation: ({ options }, previous) => {
      const kept = previous?.value;
      if (kept && options.some((option) => sameStartingPoint(option, kept))) {
        return kept;
      }
      return options[0] ?? NOTHING_TO_COPY;
    },
  });

  readonly ownProjections = computed(() => this.byKind('projection'));
  readonly importedBoards = computed(() => this.byKind('imported'));
  /** Whether a copy is what is picked, board or not — the preview draws only once one is. */
  readonly isCopy = computed(() => this.startingPoint().kind === 'copy');
  /** Whether the AI preset is what the page is showing, which is what its extra fetch follows. */
  readonly isModelPreset = computed(() => this.isPreset('model'));
  /**
   * The board a copy would be made of, as the list has it, or null when a preset is picked or
   * there is no board to copy yet. Its name is what the preview falls back to when the board
   * itself will not download.
   */
  readonly copiedBoard = computed(() => {
    const point = this.startingPoint();
    if (point.kind !== 'copy' || point.id === null) {
      return null;
    }
    return this.dataResource.value().find((board) => board.id === point.id) ?? null;
  });
  /**
   * What the preview draws. A copy card with no board behind it yet has nothing to preview, so
   * it says so rather than drawing the board that was picked before it.
   */
  readonly previewSource = computed<PreviewSource | null>(() => {
    const point = this.startingPoint();
    if (point.kind === 'preset') {
      return { kind: 'preset', preset: point.source };
    }
    return point.id === null ? null : { kind: 'board', id: point.id };
  });

  /**
   * What the preview says when it cannot draw the table. A board that will not download is still
   * a board this page knows the name of, and "an exact copy of X" is the whole of what copying
   * it means — which is more use than the preview's own "unavailable".
   */
  readonly fallbackNote = computed<string | null>(() => {
    const board = this.copiedBoard();
    if (board) {
      return `Starts as an exact copy of ${board.name}, using its saved numbers.`;
    }
    return this.isCopy() ? 'Nothing to copy yet.' : null;
  });

  readonly isLoading = this.dataResource.isLoading;
  readonly loadFailure = computed(() => this.dataResource.error());
  readonly loadError = computed(() => !!this.loadFailure());
  readonly isCreating = signal<boolean>(false);
  readonly name = linkedSignal(() =>
    freeProjectionName(this.dataResource.value().map((projection) => projection.name)),
  );

  /**
   * Whether the name is one the user is already keeping something under. The server refuses it
   * either way (names are unique per user across their own boards and imported ones alike), so
   * this is only about where they find out: on the field they can fix, rather than in a toast
   * after pressing Create.
   *
   * <p>Compared exactly, trimmed, because that is the comparison the server makes. Anything
   * looser would stop a name it would have accepted.
   */
  readonly nameTaken = computed(() => {
    const typed = this.name().trim();
    return (
      typed.length > 0 && this.dataResource.value().some((projection) => projection.name === typed)
    );
  });

  /** Whether the answer names something to start from: a preset always does, a copy needs a board. */
  private readonly hasStartingPoint = computed(() => {
    const point = this.startingPoint();
    return point.kind === 'preset' || point.id !== null;
  });

  readonly canCreate = computed(
    () =>
      !this.isCreating() &&
      this.name().trim().length > 0 &&
      !this.nameTaken() &&
      this.hasStartingPoint() &&
      // A locked starting point can be picked and read about, but not created from: the button
      // becomes the way to Premium instead, and this keeps the two from disagreeing.
      !this.aiProjectionLocked(),
  );

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onNameFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  selectPreset(source: CreatePreset['source']): void {
    this.startingPoint.set({ kind: 'preset', source });
  }

  selectCopyFrom(id: string): void {
    this.startingPoint.set({ kind: 'copy', id });
  }

  /**
   * How many starting points a kind holds, shown on its segment so the two kinds not open are
   * still accounted for. The presets are always there, so only the other two can read 0.
   */
  kindCount(kind: SourceKind): number {
    return this.optionsOf(kind).length;
  }

  /**
   * Whether to mark a preset as Premium. Only where payments exist, for the reason the draft
   * picker gives (draft-start.ts): without them the AI projection is free and ungated, and a
   * badge naming a subscription the build cannot sell promises something nobody can act on.
   */
  showsPremiumBadge(preset: CreatePreset): boolean {
    return !!preset.premium && environment.paymentsEnabled;
  }

  /**
   * Whether this account would have to subscribe before it could start from a preset. The card
   * stays pickable: picking it previews the top of the model like any other starting point, and
   * puts the pitch for the rest of the board under those rows.
   */
  isPresetLocked(preset: CreatePreset): boolean {
    return !!preset.premium && this.aiAccess.locked();
  }

  /** Whether the starting point picked right now is the one behind the subscription. */
  readonly aiProjectionLocked = computed(() => this.isModelPreset() && this.aiAccess.locked());

  isPreset(source: CreatePreset['source']): boolean {
    const point = this.startingPoint();
    return point.kind === 'preset' && point.source === source;
  }

  isCopyOf(id: string): boolean {
    const point = this.startingPoint();
    return point.kind === 'copy' && point.id === id;
  }

  /** Whose numbers a row holds, said in the row rather than only by the heading above it. */
  sourceLabel(projection: ProjectionSummaryResponse): string {
    return projection.origin ? `From ${projection.origin.authorUsername}` : 'Your projection';
  }

  /**
   * A board just copied from a share link is a starting point, so it arrives already picked —
   * checked before the list that will hold it has been re-read, since `startingPoint` keeps a
   * pick whose card turns up in the reload.
   */
  onImported(projection: ProjectionResponse): void {
    this.sourceKind.set('imported');
    this.selectCopyFrom(projection.id);
    this.dataResource.reload();
  }

  /** Every starting point of one kind, in the order its cards are drawn. */
  private optionsOf(kind: SourceKind): readonly StartingPoint[] {
    switch (kind) {
      case 'preset':
        return this.presets().map((preset) => ({ kind: 'preset', source: preset.source }) as const);
      case 'projection':
        return this.ownProjections().map(
          (projection) =>
            ({
              kind: 'copy',
              id: projection.id,
            }) as const,
        );
      case 'imported':
        return this.importedBoards().map((board) => ({ kind: 'copy', id: board.id }) as const);
    }
  }

  private byKind(kind: ProjectionSummaryResponse['kind']): ProjectionSummaryResponse[] {
    return this.dataResource
      .value()
      .filter((projection) => projection.kind === kind)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }

  retryLoad(): void {
    this.dataResource.reload();
    this.preview()?.reload();
  }

  create(): void {
    if (!this.canCreate()) {
      return;
    }
    this.isCreating.set(true);

    const point = this.startingPoint();
    if (point.kind === 'copy') {
      if (point.id === null) {
        // Unreachable through the button, which `canCreate` holds back; said for the type.
        this.isCreating.set(false);
        return;
      }
      this.boardCache
        .load(point.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (projection) => this.persist({ ...projection.data, draft: undefined }),
          error: () => {
            this.isCreating.set(false);
            this.notification.error("Couldn't load the projection to copy. Please try again.");
          },
        });
      return;
    }

    // No player rows: the server derives them from `source`, out of the same read model this
    // page would otherwise have downloaded and sent straight back (~0.5 MB, and the upload
    // that was failing in production).
    this.persist(
      this.serializer.toProjectionData(
        createDefaultProjectionState((key) => this.statInfoService.isRateStat(key)),
      ),
      point.source,
    );
  }

  private persist(data: ProjectionData, source?: CreateProjectionRequest['source']): void {
    this.projectionStorage
      .createProjection({ name: this.name().trim(), data, source })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.analytics.capture('projection_created');
          void this.router.navigate(['/projections', projection.id]);
        },
        error: (error: unknown) => {
          this.isCreating.set(false);
          // Names are unique per user, and the name is right there to change — so a 409 is
          // something to say on the page rather than a reason to navigate away from it.
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.notification.error('A projection with that name already exists.');
          } else if (isPremiumRefusal(error)) {
            // Held back by `canCreate`, so this is the two disagreeing: a subscription that
            // lapsed while the page was open, or an entitlement read that never landed.
            this.notification.error(PREMIUM_REFUSED_MESSAGE);
          } else {
            this.notification.error("Couldn't create the projection. Please try again.");
          }
        },
      });
  }
}

/**
 * What the picked card falls back to when the open kind holds nothing to copy. The kind is still
 * the answer to "what does this start from", so it stays open; only Create waits, held back by
 * `hasStartingPoint`.
 */
const NOTHING_TO_COPY: StartingPoint = { kind: 'copy', id: null };

function sameStartingPoint(first: StartingPoint, second: StartingPoint): boolean {
  if (first.kind === 'preset' && second.kind === 'preset') {
    return first.source === second.source;
  }
  return first.kind === 'copy' && second.kind === 'copy' && first.id === second.id;
}
