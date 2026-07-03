import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { PlayerService } from '../services/player.service';
import { Player } from '../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { ActiveColumns, Projection, ScoringType } from '../models/projection.model';
import { ProjectionSettingsSectionComponent } from './projection-settings-section/projection-settings-section';
import {
  YahooLeagueSyncComponent,
  YahooSyncResult,
} from './projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { YahooSync } from '../api/models/yahoo-sync';
import { DraftState } from '../api/models/draft-state';
import { SyncWarningDialogComponent } from './sync-warning-dialog/sync-warning-dialog';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from './projection-settings-section/model';
import {
  createDefaultScaleSettings,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from './projection-defaults';
import { RosterSlots } from '../api/models/roster-slots';
import { StatInfoService } from '../services/stat-info.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionState } from '../services/projection-serializer';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionSyncService } from '../services/projection-sync.service';
import { YahooService } from '../services/yahoo.service';

const AUTOSAVE_DEBOUNCE_MS = 1200;

@Component({
  selector: 'app-draft-projection',
  imports: [
    ProjectionSettingsSectionComponent,
    YahooLeagueSyncComponent,
    PlayerProjectionsTableComponent,
    LoadingIndicatorComponent,
    SyncWarningDialogComponent,
    RouterLink,
  ],
  templateUrl: './draft-projection.html',
  styleUrl: './draft-projection.css',
})
export class DraftProjectionComponent implements OnInit {
  private readonly playerService = inject(PlayerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statInfoService = inject(StatInfoService);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly yahoo = inject(YahooService);
  private readonly projectionSync = inject(ProjectionSyncService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly notification = inject(NotificationService);

  private readonly table = viewChild(PlayerProjectionsTableComponent);
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  readonly projectionName = signal<string>('');
  readonly isRenaming = signal<boolean>(false);
  readonly renameValue = signal<string>('');
  readonly renameSaving = signal<boolean>(false);
  readonly renameError = signal<string | null>(null);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly loadedProjections = signal<Projection[] | null>(null);
  private readonly projectionId = signal<string | null>(null);
  private readonly projectionLoaded = signal<boolean>(false);
  private readonly autosaveEnabled = signal<boolean>(false);
  private lastSavedJson = '';

  private readonly playersResource = rxResource({
    stream: () => this.playerService.getPlayers(),
    defaultValue: [] as Player[],
  });
  readonly players = computed(() => this.playersResource.value());

  scoringType = signal<ScoringType>('points');
  statWeights = signal<Record<ScoringStatKey, number>>(DEFAULT_STAT_WEIGHTS);

  activeScoringColumns = signal(new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS));
  activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS));
  activeColumns = computed<ActiveColumns>(() => ({
    scoring: this.activeScoringColumns(),
    utility: this.activeUtilityColumns(),
  }));
  scaleSettings = signal<Record<SkaterUtilityStatKey, ScaleConfig>>(
    createDefaultScaleSettings((key) => this.statInfoService.isRateStat(key)),
  );
  decimalSettings = signal<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  useDefaultDecimals = signal<boolean>(true);
  leagueSize = signal<number>(DEFAULT_LEAGUE_SIZE);
  rosterSlots = signal<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  minGoalieGames = signal<number>(DEFAULT_MIN_GOALIE_GAMES);
  yahooSync = signal<YahooSync | null>(null);
  draft = signal<DraftState | null>(null);

  private readonly syncedSnapshot = signal<string | null>(null);
  private readonly syncedSettingsKey = computed(() =>
    this.projectionSync.settingsSignature({
      scoringType: this.scoringType(),
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
      leagueSize: this.leagueSize(),
      rosterSlots: this.rosterSlots(),
      statWeights: this.statWeights(),
    }),
  );
  readonly diverged = computed(() =>
    this.projectionSync.hasDiverged(
      this.yahooSync(),
      this.syncedSettingsKey(),
      this.syncedSnapshot(),
    ),
  );
  readonly reSyncing = signal<boolean>(false);
  readonly reSyncError = signal<string | null>(null);

  readonly isLoading = computed(() => this.playersResource.isLoading() || !this.projectionLoaded());

  private readonly serializedState = computed(() =>
    this.autosaveEnabled()
      ? JSON.stringify(this.serializer.toProjectionData(this.buildState()))
      : '',
  );

  constructor() {
    effect(() => {
      if (this.playersResource.error()) {
        this.notification.error("Couldn't load player data. Please try again.");
        void this.router.navigate(['/projections']);
      }
    });
    effect(() => {
      if (this.isRenaming()) {
        this.renameInput()?.nativeElement.focus();
      }
    });
    toObservable(this.serializedState)
      .pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.autosave());
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/projections']);
      return;
    }
    this.openExisting(id);
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
    this.syncedSnapshot.set(this.syncedSettingsKey());
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
    this.syncedSnapshot.set(null);
  }

  private openExisting(id: string): void {
    this.projectionStorage
      .loadProjection(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.projectionId.set(projection.id);
          this.projectionName.set(projection.name);
          const state = this.serializer.fromProjectionData(projection.data);
          this.applyState(state);
          this.lastSavedJson = JSON.stringify(this.serializer.toProjectionData(state));
          this.projectionLoaded.set(true);
          this.autosaveEnabled.set(true);
        },
        error: () => {
          this.notification.error("Couldn't open the projection. Please try again.");
          void this.router.navigate(['/projections']);
        },
      });
  }

  private buildState(): ProjectionState {
    return {
      scoringType: this.scoringType(),
      statWeights: this.statWeights(),
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
      scaleSettings: this.scaleSettings(),
      decimalSettings: this.decimalSettings(),
      useDefaultDecimals: this.useDefaultDecimals(),
      leagueSize: this.leagueSize(),
      rosterSlots: this.rosterSlots(),
      minGoalieGames: this.minGoalieGames(),
      yahooSync: this.yahooSync(),
      draft: this.draft(),
      playerProjections: this.table()?.playerProjections?.() ?? this.loadedProjections() ?? [],
    };
  }

  private applyState(state: ProjectionState): void {
    this.scoringType.set(state.scoringType);
    this.statWeights.set(state.statWeights);
    this.activeScoringColumns.set(state.activeScoringColumns);
    this.activeUtilityColumns.set(state.activeUtilityColumns);
    this.scaleSettings.set(state.scaleSettings);
    this.decimalSettings.set(state.decimalSettings);
    this.useDefaultDecimals.set(state.useDefaultDecimals);
    this.leagueSize.set(state.leagueSize);
    this.rosterSlots.set(state.rosterSlots);
    this.minGoalieGames.set(state.minGoalieGames);
    this.yahooSync.set(state.yahooSync);
    this.draft.set(state.draft);
    this.loadedProjections.set(state.playerProjections);
    this.syncedSnapshot.set(this.syncedSettingsKey());
  }

  private autosave(): void {
    const id = this.projectionId();
    if (!this.autosaveEnabled() || !id) {
      return;
    }
    const data = this.serializer.toProjectionData(this.buildState());
    const json = JSON.stringify(data);
    if (json === this.lastSavedJson) {
      return;
    }
    this.lastSavedJson = json;
    this.saveStatus.set('saving');
    this.projectionStorage
      .updateProjection(id, { name: this.projectionName(), data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saveStatus.set('saved'),
        error: () => this.saveStatus.set('error'),
      });
  }

  startRename(): void {
    this.renameValue.set(this.projectionName());
    this.renameError.set(null);
    this.isRenaming.set(true);
  }

  cancelRename(): void {
    this.isRenaming.set(false);
    this.renameError.set(null);
  }

  onRenameInput(event: Event): void {
    this.renameValue.set((event.target as HTMLInputElement).value);
  }

  saveRename(): void {
    const newName = this.renameValue().trim();
    const id = this.projectionId();
    if (!id || this.renameSaving()) {
      return;
    }
    if (!newName) {
      this.renameError.set('Name cannot be empty.');
      return;
    }
    if (newName === this.projectionName()) {
      this.cancelRename();
      return;
    }

    const data = this.serializer.toProjectionData(this.buildState());
    this.renameSaving.set(true);
    this.renameError.set(null);
    this.projectionStorage
      .updateProjection(id, { name: newName, data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.projectionName.set(newName);
          this.lastSavedJson = JSON.stringify(data);
          this.renameSaving.set(false);
          this.isRenaming.set(false);
        },
        error: (error: unknown) => {
          this.renameSaving.set(false);
          const conflict = error instanceof HttpErrorResponse && error.status === 409;
          this.renameError.set(
            conflict
              ? 'A projection with that name already exists.'
              : 'Could not rename the projection.',
          );
        },
      });
  }
}
