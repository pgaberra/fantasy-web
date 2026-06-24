import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { PlayerService } from '../services/player.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { StatInfoService } from '../services/stat-info.service';
import { Player } from '../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { GoalieStats, Projection, ScoringType, SkaterStats } from '../models/projection.model';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionSettingsSectionComponent } from '../draft-projection/projection-settings-section/projection-settings-section';
import {
  YahooLeagueSyncComponent,
  YahooSyncResult,
} from '../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { YahooSync } from '../api/models/yahoo-sync';
import { SyncWarningDialogComponent } from '../draft-projection/sync-warning-dialog/sync-warning-dialog';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { InfoTooltipComponent } from '../shared/info-tooltip/info-tooltip';
import {
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from '../draft-projection/projection-settings-section/model';
import {
  createDefaultScaleSettings,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../draft-projection/projection-defaults';
import { RosterSlots } from '../api/models/roster-slots';
import {
  fromProjectionData,
  ProjectionState,
  toProjectionData,
} from '../services/projection-serializer';
import { createSyncGuard, syncedSettingsSignature } from '../services/projection-sync';
import { YahooService } from '../services/yahoo.service';

type DataSource = 'last-season' | 'blank' | 'copy';

@Component({
  selector: 'app-projection-create',
  imports: [
    ProjectionSettingsSectionComponent,
    YahooLeagueSyncComponent,
    LoadingIndicatorComponent,
    InfoTooltipComponent,
    SyncWarningDialogComponent,
    RouterLink,
  ],
  templateUrl: './projection-create.html',
  styleUrl: './projection-create.css',
})
export class ProjectionCreateComponent {
  private readonly playerService = inject(PlayerService);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly yahoo = inject(YahooService);

  private readonly dataResource = rxResource({
    stream: () =>
      forkJoin({
        players: this.playerService.getPlayers(),
        projections: this.projectionStorage.listProjections(),
      }),
    defaultValue: { players: [] as Player[], projections: [] as ProjectionSummaryResponse[] },
  });

  readonly dataSource = signal<DataSource>('last-season');
  readonly copyFromId = signal<string | null>(null);
  readonly existingProjections = computed(() => this.dataResource.value().projections);
  readonly isLoading = this.dataResource.isLoading;
  readonly isCreating = signal<boolean>(false);
  readonly name = linkedSignal(() => this.defaultName(this.dataResource.value().projections));

  private readonly players = computed(() => this.dataResource.value().players);

  scoringType = signal<ScoringType>('points');
  activeScoringColumns = signal(new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS));
  activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS));
  scaleSettings = signal<Record<SkaterUtilityStatKey, ScaleConfig>>(
    createDefaultScaleSettings((key) => this.statInfoService.isRateStat(key)),
  );
  useDefaultDecimals = signal<boolean>(true);
  leagueSize = signal<number>(DEFAULT_LEAGUE_SIZE);
  rosterSlots = signal<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  minGoalieGames = signal<number>(DEFAULT_MIN_GOALIE_GAMES);
  statWeights = signal<Record<ScoringStatKey, number>>(DEFAULT_STAT_WEIGHTS);
  yahooSync = signal<YahooSync | null>(null);

  private readonly syncedSettingsKey = computed(() =>
    syncedSettingsSignature({
      scoringType: this.scoringType(),
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
      leagueSize: this.leagueSize(),
      rosterSlots: this.rosterSlots(),
      statWeights: this.statWeights(),
    }),
  );
  private readonly syncGuard = createSyncGuard(this.yahooSync, this.syncedSettingsKey);
  readonly diverged = this.syncGuard.diverged;
  readonly reSyncing = signal<boolean>(false);
  readonly reSyncError = signal<string | null>(null);

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

  applyYahooSettings(result: YahooSyncResult): void {
    const mapped = result.settings;
    this.scoringType.set(mapped.scoringType);
    this.activeScoringColumns.set(new Set(mapped.activeScoringColumns as ScoringStatKey[]));
    this.activeUtilityColumns.set(new Set(mapped.activeUtilityColumns as SkaterUtilityStatKey[]));
    if (mapped.leagueSize != null) {
      this.leagueSize.set(mapped.leagueSize);
    }
    this.rosterSlots.set(mapped.rosterSlots);
    if (mapped.statWeights) {
      this.statWeights.set(mapped.statWeights as Record<ScoringStatKey, number>);
    }
    this.yahooSync.set({
      leagueName: result.leagueName,
      leagueKey: result.leagueKey,
      syncedAt: new Date().toISOString(),
    });
    this.syncGuard.markSynced();
  }

  reSync(): void {
    const sync = this.yahooSync();
    if (!sync || this.reSyncing()) {
      return;
    }
    this.reSyncing.set(true);
    this.reSyncError.set(null);
    this.yahoo
      .leagueProjectionSettings(sync.leagueKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.applyYahooSettings({
            settings,
            leagueName: sync.leagueName,
            leagueKey: sync.leagueKey,
          });
          this.reSyncing.set(false);
        },
        error: () => {
          this.reSyncing.set(false);
          this.reSyncError.set('Could not re-sync from Yahoo. Try again.');
        },
      });
  }

  confirmUnsync(): void {
    this.yahooSync.set(null);
    this.syncGuard.clear();
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
      statWeights: this.statWeights(),
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
      scaleSettings: this.scaleSettings(),
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      useDefaultDecimals: this.useDefaultDecimals(),
      leagueSize: this.leagueSize(),
      rosterSlots: this.rosterSlots(),
      minGoalieGames: this.minGoalieGames(),
      yahooSync: this.yahooSync(),
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
      utility: zero(stats.utility),
      scoring: zero(stats.scoring),
    } as SkaterStats | GoalieStats;
  }
}
