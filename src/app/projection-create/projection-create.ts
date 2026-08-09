import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnalyticsService } from '../services/analytics.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { StatInfoService } from '../services/stat-info.service';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { Projection } from '../models/projection.model';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionData } from '../api/models/projection-data';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { InfoTooltipComponent } from '../shared/info-tooltip/info-tooltip';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import {
  createDefaultScaleSettings,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../draft-projection/projection-defaults';
import { ProjectionState } from '../services/projection-serializer';
import { ProjectionSerializerService } from '../services/projection-serializer.service';

type DataSource = 'last-season' | 'blank' | 'copy';

@Component({
  selector: 'app-projection-create',
  imports: [LoadingIndicatorComponent, ErrorStateComponent, InfoTooltipComponent, RouterLink],
  templateUrl: './projection-create.html',
  styleUrl: './projection-create.css',
})
export class ProjectionCreateComponent {
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  // Only the existing projections are needed here: the player rows of a new projection are
  // filled in server-side from `source`, so this page no longer downloads every player just
  // to upload them straight back.
  private readonly dataResource = rxResource({
    stream: () => this.projectionStorage.listProjections(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  readonly dataSource = signal<DataSource>('last-season');
  readonly copyFromId = signal<string | null>(null);
  readonly existingProjections = computed(() => this.dataResource.value());
  readonly isLoading = this.dataResource.isLoading;
  readonly loadError = computed(() => !!this.dataResource.error());
  readonly isCreating = signal<boolean>(false);
  readonly name = linkedSignal(() => this.defaultName(this.dataResource.value()));

  readonly canCreate = computed(
    () =>
      !this.isCreating() &&
      this.name().trim().length > 0 &&
      (this.dataSource() !== 'copy' || !!this.copyFromId()),
  );

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onNameFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  private defaultName(projections: ProjectionSummaryResponse[]): string {
    const takenNames = new Set(projections.map((projection) => projection.name));
    if (!takenNames.has('My Projection')) {
      return 'My Projection';
    }
    let suffix = 2;
    while (takenNames.has(`My Projection ${suffix}`)) {
      suffix++;
    }
    return `My Projection ${suffix}`;
  }

  onCopyFromChange(event: Event): void {
    this.copyFromId.set((event.target as HTMLSelectElement).value || null);
  }

  retryLoad(): void {
    this.dataResource.reload();
  }

  create(): void {
    if (!this.canCreate()) {
      return;
    }
    this.isCreating.set(true);

    if (this.dataSource() === 'copy') {
      this.projectionStorage
        .loadProjection(this.copyFromId()!)
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
      this.serializer.toProjectionData(this.buildDefaultState([])),
      this.dataSource() === 'blank' ? 'blank' : 'default',
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
          // Each user may keep only one projection; the server rejects a second with 409.
          if (error instanceof HttpErrorResponse && error.status === 409) {
            void this.router.navigate(['/projections']);
          } else {
            this.notification.error("Couldn't create the projection. Please try again.");
          }
        },
      });
  }

  private buildDefaultState(playerProjections: Projection[]): ProjectionState {
    return {
      scoringType: 'points',
      statWeights: DEFAULT_STAT_WEIGHTS,
      activeScoringColumns: new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS),
      activeUtilityColumns: new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS),
      scaleSettings: createDefaultScaleSettings((key) => this.statInfoService.isRateStat(key)),
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      useDefaultDecimals: true,
      leagueSize: DEFAULT_LEAGUE_SIZE,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
      yahooSync: null,
      draft: null,
      playerProjections,
    };
  }
}
