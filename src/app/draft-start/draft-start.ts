import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { NotificationService } from '../services/notification.service';
import { StatInfoService } from '../services/stat-info.service';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { createDefaultProjectionState } from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { PopoverTriggerDirective } from '../shared/popover/popover-trigger.directive';
import { ShareImportComponent } from '../shared/share-import/share-import';
import { offeredPresets } from '../models/ai-projection';

/**
 * The name the preset draft is stored under. It doubles as the label on the board, so the
 * heading there reads the same as the row the draft was started from.
 */
export const LAST_SEASON_PRESET_NAME = "Last Season's Stats";

/** The model's own estimate for the coming season. Named by the server, like the other preset. */
export const MODEL_PRESET_NAME = 'AI Projection';

/**
 * A starting point everyone shares, as opposed to a projection someone owns.
 *
 * <p>`id` is what a stored draft is matched on. It used to be the name, because `kind:
 * 'preset_draft'` says a draft came from a preset but not which one — the server now records
 * which, so the name is free to change without orphaning the drafts started from it.
 */
export interface Preset {
  readonly id: NonNullable<ProjectionSummaryResponse['preset']>;
  readonly name: string;
  readonly source: CreateProjectionRequest['source'];
  readonly description: string;
}

/** Every preset the picker knows of. What it offers is `availablePresets` — see below. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'last_season',
    name: LAST_SEASON_PRESET_NAME,
    source: 'default',
    description: "Every player at last season's numbers, default scoring settings",
  },
  {
    id: 'model',
    name: MODEL_PRESET_NAME,
    source: 'model',
    description: "The model's estimate for the coming season: a qualified guess, not the truth",
  },
];

/**
 * Picks what a draft is drafted against: one of the user's own projections, a board copied from
 * someone's share link, or a preset.
 *
 * <p>The page asks two questions in that order, and every row belongs to exactly one of them.
 * "Your drafts" is every draft that exists, whatever it was started against; "Start a new draft"
 * is the sources that have none yet. The two used to overlap: an unfinished draft was copied to
 * the top of the page rather than lifted out of the list below, so half the rows on screen were
 * a second rendering of a row further down, carrying the same buttons under a different label.
 * A source holds at most one draft, so splitting them this way leaves nothing out and nothing
 * twice.
 *
 * <p>A preset draft has no projection behind it, so starting one creates a projection of its own
 * kind — seeded server-side from the same read model a new projection starts from — purely to
 * hold the picks. It never shows up under "Your projections".
 */
@Component({
  selector: 'app-draft-start',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    PopoverTriggerDirective,
    ShareImportComponent,
  ],
  templateUrl: './draft-start.html',
  styleUrl: './draft-start.css',
})
export class DraftStartComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The presets this build knows of. What the page offers is `availablePresets`, the ones with
   * no draft yet. Filtered rather than constant: the AI projection is behind a build flag, and a
   * row that starts a draft the build cannot seed is worse than no row.
   */
  readonly presets = offeredPresets(PRESETS);

  readonly sourcesResource = rxResource({
    stream: () => this.storage.listWithPresetDrafts(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  readonly isStarting = signal(false);
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
   */
  readonly availablePresets = computed(() =>
    this.presets.filter((preset) => !this.presetDraft(preset)),
  );

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
    return projection.origin ? `From ${projection.origin.authorUsername}` : 'Your projection';
  }

  /** What the timestamp beside it means, which differs for a draft still being made. */
  timingLabel(draft: ProjectionSummaryResponse): string {
    return draft.draftStatus === 'finished' ? 'finished' : 'last pick';
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

  openDraft(id: string): void {
    void this.router.navigate(['/projections', id, 'draft']);
  }

  requestDiscard(draft: ProjectionSummaryResponse): void {
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
      ? 'Discard this draft? The picks are lost.'
      : 'Discard the picks? The projection stays.';
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

  /** The copy is the user's board now, and the list it joins is already on the page. */
  onImported(): void {
    this.sourcesResource.reload();
  }

  startPreset(preset: Preset): void {
    // The row is only offered while the preset has no draft; this covers one started elsewhere
    // since the list was read, which would otherwise seed a second board for the same preset.
    const existing = this.presetDraft(preset);
    if (existing) {
      this.openDraft(existing.id);
      return;
    }
    this.start(this.createPresetDraft(preset));
  }

  private undrafted(kind: ProjectionSummaryResponse['kind']): ProjectionSummaryResponse[] {
    return this.sourcesResource
      .value()
      .filter((projection) => projection.kind === kind && projection.draftStatus === 'none')
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }

  private createPresetDraft(preset: Preset): Observable<ProjectionResponse> {
    // No player rows: `source` has the server fill them in, exactly as a new projection created
    // from the same starting point does. The name is sent for completeness — the server names a
    // preset draft itself, so that a board cannot claim a preset it was not drafted against.
    return this.storage.createProjection({
      name: preset.name,
      kind: 'preset_draft',
      source: preset.source,
      data: this.serializer.toProjectionData(
        createDefaultProjectionState((key) => this.statInfoService.isRateStat(key)),
      ),
    });
  }

  private start(started: Observable<ProjectionResponse>): void {
    this.isStarting.set(true);
    started.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (projection) => this.openDraft(projection.id),
      error: () => {
        this.isStarting.set(false);
        this.sourcesResource.reload();
        this.notification.error("Couldn't start the draft. Please try again.");
      },
    });
  }
}
