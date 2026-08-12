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
import { createDefaultProjectionState } from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

/**
 * The name the preset draft is stored under. It doubles as the label on the board, so the
 * heading there reads the same as the card the draft was started from.
 */
export const LAST_SEASON_PRESET_NAME = "Last Season's Stats";

/**
 * Picks what a draft is drafted against: one of the user's own projections, or a preset.
 *
 * A preset draft has no projection behind it, so starting one creates a projection of its own
 * kind — seeded server-side from the same read model a new projection starts from — purely to
 * hold the picks. It never shows up under "My projections".
 */
@Component({
  selector: 'app-draft-start',
  imports: [RouterLink, LoadingIndicatorComponent, ErrorStateComponent, RelativeTimePipe],
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

  readonly presetName = LAST_SEASON_PRESET_NAME;

  readonly sourcesResource = rxResource({
    stream: () => this.storage.listWithPresetDrafts(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  readonly isStarting = signal(false);
  readonly confirmingRestart = signal(false);

  readonly projections = computed(() =>
    this.sourcesResource
      .value()
      .filter((projection) => projection.kind === 'projection')
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
  );

  readonly presetDraft = computed(
    () =>
      this.sourcesResource.value().find((projection) => projection.kind === 'preset_draft') ?? null,
  );

  readonly presetLabel = computed(() => this.draftLabel(this.presetDraft()?.draftStatus ?? 'none'));

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

  retry(): void {
    this.sourcesResource.reload();
  }

  openDraft(id: string): void {
    void this.router.navigate(['/projections', id, 'draft']);
  }

  startPreset(): void {
    const existing = this.presetDraft();
    if (existing) {
      this.openDraft(existing.id);
      return;
    }
    this.start(this.createPresetDraft());
  }

  requestRestart(): void {
    this.confirmingRestart.set(true);
  }

  cancelRestart(): void {
    this.confirmingRestart.set(false);
  }

  /**
   * Starting over throws the stored preset draft away and seeds a fresh one — the picks are
   * all it holds, and its player rows are the same for everyone, so there is nothing worth
   * keeping. A projection's draft is reset from the board instead, where the projection
   * itself has to survive.
   */
  confirmRestart(): void {
    const existing = this.presetDraft();
    this.confirmingRestart.set(false);
    if (!existing) {
      return;
    }
    this.start(
      this.storage.deleteProjection(existing.id).pipe(switchMap(() => this.createPresetDraft())),
    );
  }

  private createPresetDraft(): Observable<ProjectionResponse> {
    // No player rows: `source` has the server fill them from its read model, exactly as a new
    // projection created from last season's stats does.
    return this.storage.createProjection({
      name: LAST_SEASON_PRESET_NAME,
      kind: 'preset_draft',
      source: 'default',
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
