import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
 * heading there reads the same as the row the draft was started from.
 */
export const LAST_SEASON_PRESET_NAME = "Last Season's Stats";

/** Which kind of source the picker is showing. */
export type SourceTab = 'own' | 'imported' | 'presets';

/**
 * Pulls the token out of whatever gets pasted: a whole share URL, the path from one, or the
 * token on its own. Anything else is not a link we published.
 */
export function shareTokenFrom(pasted: string): string | null {
  const trimmed = pasted.trim();
  const fromLink = /\/s\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (fromLink) {
    return fromLink[1];
  }
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

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
  readonly selectedTab = signal<SourceTab>('own');

  readonly shareInput = signal('');
  readonly isImporting = signal(false);
  readonly importHint = signal<string | null>(null);
  /** Non-null only after a name clash, which is the one thing the importer has to settle. */
  readonly importName = signal<string | null>(null);

  readonly projections = computed(() => this.byKind('projection'));
  readonly imported = computed(() => this.byKind('imported'));

  readonly presetDraft = computed(
    () =>
      this.sourcesResource.value().find((projection) => projection.kind === 'preset_draft') ?? null,
  );

  readonly presetLabel = computed(() => this.draftLabel(this.presetDraft()?.draftStatus ?? 'none'));

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

  importShared(): void {
    const token = shareTokenFrom(this.shareInput());
    if (!token) {
      this.importHint.set("That doesn't look like a SlapStat share link.");
      return;
    }
    const chosenName = this.importName()?.trim();
    if (this.importName() !== null && !chosenName) {
      this.importHint.set('Give the copy a name.');
      return;
    }
    this.importHint.set(null);
    this.isImporting.set(true);
    this.storage
      .importFromShare(token, chosenName || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isImporting.set(false);
          this.shareInput.set('');
          this.importName.set(null);
          this.selectedTab.set('imported');
          this.sourcesResource.reload();
        },
        error: (error: unknown) => {
          this.isImporting.set(false);
          this.onImportFailed(error);
        },
      });
  }

  /**
   * A name clash is the importer's to settle — two people can call a projection the same thing,
   * and only the one copying can say what the second should be called — so it asks for a name
   * rather than reporting a failure they could do nothing about.
   */
  private onImportFailed(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.importName.set(this.importName() ?? '');
      this.importHint.set('You already have a board with that name. Give this copy another.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.importHint.set("That link isn't active any more.");
      return;
    }
    this.notification.error("Couldn't import that board. Please try again.");
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

  private byKind(kind: ProjectionSummaryResponse['kind']): ProjectionSummaryResponse[] {
    return this.sourcesResource
      .value()
      .filter((projection) => projection.kind === kind)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
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
