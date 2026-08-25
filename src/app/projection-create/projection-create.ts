import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnalyticsService } from '../services/analytics.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { StatInfoService } from '../services/stat-info.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { Skater } from '../models/player.model';
import { StatKey } from '../models/stat-key.model';
import { StatLabelPipe } from '../pipes/stat-label.pipe';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { ProjectionData } from '../api/models/projection-data';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import {
  createDefaultProjectionState,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionModelService } from '../services/projection-model.service';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';

type DataSource = 'last-season' | 'ai' | 'blank' | 'copy';

/**
 * What each starting point sends as `source`. 'copy' is absent on purpose: it uploads rows
 * taken from another projection rather than asking the server to derive them.
 */
const SOURCE_BY_CHOICE: Record<Exclude<DataSource, 'copy'>, CreateProjectionRequest['source']> = {
  'last-season': 'default',
  ai: 'model',
  blank: 'blank',
};

/**
 * How many rows the preview shows. Enough to see what the editor opens as — the columns, the
 * order, whether the numbers are real or zeroed — without turning this page into the editor.
 */
const PREVIEW_ROWS = 5;

interface PreviewRow {
  playerId: number;
  name: string;
  position: string;
  teamAbbrev?: string;
  /** Aligned with `previewColumns`. Null where the model has no line for this player. */
  values: (number | null)[];
}

@Component({
  selector: 'app-projection-create',
  imports: [
    LoadingIndicatorComponent,
    ErrorStateComponent,
    HelpTipComponent,
    RouterLink,
    StatLabelPipe,
  ],
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
  private readonly playerService = inject(PlayerService);
  private readonly projectionModel = inject(ProjectionModelService);
  private readonly ranking = inject(ProjectionRankingService);

  // Only the existing projections are needed here: the player rows of a new projection are
  // filled in server-side from `source`, so this page no longer downloads every player just
  // to upload them straight back.
  private readonly dataResource = rxResource({
    stream: () => this.projectionStorage.listProjections(),
    defaultValue: [] as ProjectionSummaryResponse[],
  });

  /**
   * The preview's own fetch, kept apart from `dataResource`: it is decoration, so a slow or
   * failed player read model must not stop anyone creating a projection. Skaters only — five
   * rows of skater columns is all it shows, and asking for the goalies too would double a
   * download this page had deliberately dropped.
   */
  private readonly previewPlayersResource = rxResource({
    stream: () => this.playerService.getSkaters(),
    defaultValue: [] as Skater[],
  });

  readonly dataSource = signal<DataSource>('last-season');

  /**
   * The model's lines, fetched only once the AI preset is picked. It is a second download the
   * size of the player pool, so making it lazy keeps the page as fast as it was for everyone
   * who never chooses it.
   */
  private readonly modelSeedResource = rxResource({
    params: () => (this.dataSource() === 'ai' ? {} : undefined),
    stream: () => this.projectionModel.seed(),
    defaultValue: undefined as SeededProjectionResponse | undefined,
  });
  readonly copyFromId = signal<string | null>(null);
  readonly existingProjections = computed(() => this.dataResource.value());
  readonly isLoading = this.dataResource.isLoading;
  readonly loadError = computed(() => !!this.dataResource.error());
  readonly isCreating = signal<boolean>(false);
  readonly name = linkedSignal(() => this.defaultName(this.dataResource.value()));

  /** The columns a new projection opens with, minus the goalie ones the preview has no rows for. */
  readonly previewColumns: StatKey[] = [
    ...DEFAULT_UTILITY_COLUMNS,
    ...DEFAULT_SCORING_COLUMNS.filter((key) => this.statInfoService.isSkaterScoringStat(key)),
  ];
  readonly isPreviewLoading = this.previewPlayersResource.isLoading;
  readonly previewFailed = computed(() => !!this.previewPlayersResource.error());

  /** The players the editor would put on top, ranked exactly as it ranks them by default. */
  private readonly previewPlayers = computed<Skater[]>(() => {
    const skaters = this.previewPlayersResource.value();
    if (!skaters.length) {
      return [];
    }
    const byId = new Map(skaters.map((skater) => [skater.id, skater]));
    return this.ranking
      .rankOverall({
        projections: skaters.map((skater) => ({
          type: 'skater' as const,
          playerId: skater.id,
          stats: skater.stats,
        })),
        scoringType: 'points',
        statWeights: DEFAULT_STAT_WEIGHTS,
        activeScoringColumns: new Set(DEFAULT_SCORING_COLUMNS),
        leagueSize: DEFAULT_LEAGUE_SIZE,
        rosterSlots: DEFAULT_ROSTER_SLOTS,
        minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
        decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      })
      .slice(0, PREVIEW_ROWS)
      .map((scored) => byId.get(scored.projection.playerId))
      .filter((skater): skater is Skater => !!skater);
  });

  /** The model's lines by player id, for the preview to read instead of last season's. */
  private readonly modelStatsByPlayer = computed<Map<number, Record<StatKey, number>>>(() => {
    const seeded = this.modelSeedResource.value();
    if (!seeded) {
      return new Map();
    }
    return new Map(
      seeded.players.map((player) => [
        player.playerId,
        { ...player.stats.utility, ...player.stats.scoring } as Record<StatKey, number>,
      ]),
    );
  });

  readonly previewRows = computed<PreviewRow[]>(() => {
    // 'From scratch' is the same players and the same columns, just emptied — which is the
    // whole point of showing it: the shape doesn't change, only the numbers.
    const source = this.dataSource();
    const zeroed = source === 'blank';
    const modelStats = source === 'ai' ? this.modelStatsByPlayer() : null;
    return this.previewPlayers().map((skater) => {
      const stats = { ...skater.stats.utility, ...skater.stats.scoring } as Record<StatKey, number>;
      // A player the model could not reach has no line at all. Showing last season's numbers
      // under the AI heading would credit them to the model, so the row reads as unfilled.
      const projected = modelStats?.get(skater.id);
      return {
        playerId: skater.id,
        name: skater.name,
        position: Array.from(skater.positions).join(', '),
        teamAbbrev: skater.teamAbbrev,
        values: this.previewColumns.map((col) => {
          if (zeroed) {
            return 0;
          }
          if (modelStats) {
            return projected ? (projected[col] ?? 0) : null;
          }
          return stats[col] ?? 0;
        }),
      };
    });
  });

  readonly isModelPreviewLoading = computed(
    () => this.dataSource() === 'ai' && this.modelSeedResource.isLoading(),
  );

  /** What the model covered, so the page can say so rather than quietly seeding fewer rows. */
  readonly modelCoverage = computed(() => {
    const seeded = this.modelSeedResource.value();
    return seeded ? { skaters: seeded.skaters, goalies: seeded.goalies } : null;
  });

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
    this.previewPlayersResource.reload();
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
      this.serializer.toProjectionData(
        createDefaultProjectionState((key) => this.statInfoService.isRateStat(key)),
      ),
      SOURCE_BY_CHOICE[this.dataSource() as Exclude<DataSource, 'copy'>],
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
}
