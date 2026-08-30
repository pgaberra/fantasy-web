import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, switchMap } from 'rxjs';
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
import { ShareImportComponent } from '../shared/share-import/share-import';

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

/** Which kind of source the picker is showing. */
export type SourceTab = 'own' | 'imported' | 'presets';

/**
 * Picks what a draft is drafted against: one of the user's own projections, a board copied from
 * someone's share link, or a preset.
 *
 * A preset draft has no projection behind it, so starting one creates a projection of its own
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

  readonly presets = PRESETS;

  readonly sourcesResource = rxResource({
    stream: () => this.storage.listWithPresetDrafts(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  readonly isStarting = signal(false);
  /** Which preset is being asked about, so two rows cannot share one confirmation. */
  readonly confirmingRestart = signal<Preset['id'] | null>(null);
  readonly selectedTab = signal<SourceTab>('own');

  readonly projections = computed(() => this.byKind('projection'));
  readonly imported = computed(() => this.byKind('imported'));

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

  presetDraft(preset: Preset): ProjectionSummaryResponse | null {
    return this.presetDrafts().get(preset.id) ?? null;
  }

  presetLabel(preset: Preset): string {
    return this.draftLabel(this.presetDraft(preset)?.draftStatus ?? 'none');
  }

  /**
   * Drafts left mid-way, lifted out of the lists below. Resuming one is what most visits here
   * are for, and it would otherwise be buried under whichever tab its source happens to sit in.
   */
  readonly inProgress = computed(() =>
    this.sourcesResource
      .value()
      .filter((projection) => projection.draftStatus === 'in_progress')
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
  );

  selectTab(tab: SourceTab): void {
    this.selectedTab.set(tab);
  }

  draftLabel(status: ProjectionSummaryResponse['draftStatus']): string {
    switch (status) {
      case 'finished':
        return 'View summary';
      case 'in_progress':
        return 'Resume draft';
      default:
        return 'Start draft';
    }
  }

  /** Whose numbers a row holds, said in the row rather than only by the tab it sits under. */
  sourceLabel(projection: ProjectionSummaryResponse): string {
    return projection.origin ? `From ${projection.origin.authorUsername}` : 'Your projection';
  }

  retry(): void {
    this.sourcesResource.reload();
  }

  openDraft(id: string): void {
    void this.router.navigate(['/projections', id, 'draft']);
  }

  /** The copy is the user's board now, so the tab that lists those is where it belongs. */
  onImported(): void {
    this.selectedTab.set('imported');
    this.sourcesResource.reload();
  }

  startPreset(preset: Preset): void {
    const existing = this.presetDraft(preset);
    if (existing) {
      this.openDraft(existing.id);
      return;
    }
    this.start(this.createPresetDraft(preset));
  }

  requestRestart(preset: Preset): void {
    this.confirmingRestart.set(preset.id);
  }

  cancelRestart(): void {
    this.confirmingRestart.set(null);
  }

  isConfirmingRestart(preset: Preset): boolean {
    return this.confirmingRestart() === preset.id;
  }

  /**
   * Starting over throws the stored preset draft away and seeds a fresh one — the picks are
   * all it holds, and its player rows are the same for everyone, so there is nothing worth
   * keeping. A projection's draft is reset from the board instead, where the projection
   * itself has to survive.
   */
  confirmRestart(preset: Preset): void {
    const existing = this.presetDraft(preset);
    this.confirmingRestart.set(null);
    if (!existing) {
      return;
    }
    this.start(
      this.storage
        .deleteProjection(existing.id)
        .pipe(switchMap(() => this.createPresetDraft(preset))),
    );
  }

  private byKind(kind: ProjectionSummaryResponse['kind']): ProjectionSummaryResponse[] {
    return this.sourcesResource
      .value()
      .filter((projection) => projection.kind === kind)
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
