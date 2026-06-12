import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { PlayerService } from '../services/player.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { StatInfoService } from '../services/stat-info.service';
import { Player } from '../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { GoalieStats, Projection, ScoringType, SkaterStats } from '../models/projection.model';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionSettingsSectionComponent } from '../draft-projection/projection-settings-section/projection-settings-section';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from '../draft-projection/projection-settings-section/model';
import {
  createDefaultScaleSettings,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../draft-projection/projection-defaults';
import {
  fromProjectionData,
  ProjectionState,
  toProjectionData,
} from '../services/projection-serializer';

type DataSource = 'last-season' | 'blank' | 'copy';

@Component({
  selector: 'app-projection-create',
  imports: [ProjectionSettingsSectionComponent, LoadingIndicatorComponent, RouterLink],
  templateUrl: './projection-create.html',
  styleUrl: './projection-create.css',
})
export class ProjectionCreateComponent implements OnInit {
  private readonly playerService = inject(PlayerService);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly name = signal<string>('');
  readonly dataSource = signal<DataSource>('last-season');
  readonly copyFromId = signal<string | null>(null);
  readonly existingProjections = signal<ProjectionSummaryResponse[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly isCreating = signal<boolean>(false);

  private readonly players = signal<Player[]>([]);

  scoringType = signal<ScoringType>('points');
  activeScoringColumns = signal(new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS));
  activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS));
  scaleSettings = signal<Record<SkaterUtilityStatKey, ScaleConfig>>(
    createDefaultScaleSettings((key) => this.statInfoService.isRateStat(key)),
  );
  useDefaultDecimals = signal<boolean>(true);

  readonly canCreate = computed(
    () =>
      !this.isCreating() &&
      this.name().trim().length > 0 &&
      (this.dataSource() !== 'copy' || !!this.copyFromId()),
  );

  ngOnInit(): void {
    forkJoin({
      skaters: this.playerService.getSkaters(),
      goalies: this.playerService.getGoalies(),
      projections: this.projectionStorage.listProjections(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ skaters, goalies, projections }) => {
          this.players.set([...skaters, ...goalies]);
          this.existingProjections.set(projections);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
  }

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onCopyFromChange(event: Event): void {
    this.copyFromId.set((event.target as HTMLSelectElement).value || null);
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
          next: (projection) => this.persist(fromProjectionData(projection.data).playerProjections),
          error: () => this.isCreating.set(false),
        });
      return;
    }

    this.persist(this.buildPlayerProjections(this.dataSource() === 'blank'));
  }

  private persist(playerProjections: Projection[]): void {
    const data = toProjectionData(this.buildState(playerProjections));
    this.projectionStorage
      .createProjection({ name: this.name().trim(), data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => void this.router.navigate(['/projections', projection.id]),
        error: () => this.isCreating.set(false),
      });
  }

  private buildState(playerProjections: Projection[]): ProjectionState {
    return {
      scoringType: this.scoringType(),
      statWeights: DEFAULT_STAT_WEIGHTS,
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
      scaleSettings: this.scaleSettings(),
      decimalSettings: DEFAULT_DECIMAL_SETTINGS as Record<DecimalStatKey, number>,
      useDefaultDecimals: this.useDefaultDecimals(),
      playerProjections,
    };
  }

  private buildPlayerProjections(blank: boolean): Projection[] {
    return this.players().map((player) => {
      if (player.type === 'skater') {
        return {
          type: 'skater',
          playerId: player.id,
          stats: blank ? (this.zeroStats(player.stats) as SkaterStats) : player.stats,
        };
      }
      return {
        type: 'goalie',
        playerId: player.id,
        stats: blank ? (this.zeroStats(player.stats) as GoalieStats) : player.stats,
      };
    });
  }

  private zeroStats(stats: SkaterStats | GoalieStats): SkaterStats | GoalieStats {
    const zero = (record: Record<string, number>): Record<string, number> =>
      Object.fromEntries(Object.keys(record).map((key) => [key, 0]));
    return {
      utility: zero(stats.utility as Record<string, number>),
      scoring: zero(stats.scoring as Record<string, number>),
    } as SkaterStats | GoalieStats;
  }
}
