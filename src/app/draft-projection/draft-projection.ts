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
import { LeagueSyncComponent } from './projection-settings-section/league-sync/league-sync';
import { LeagueSyncDialogComponent } from './league-sync-dialog/league-sync-dialog';
import { YahooSyncResult } from './projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from './projection-settings-section/espn-league-sync/espn-league-sync';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { YahooSync } from '../api/models/yahoo-sync';
import { EspnSync } from '../api/models/espn-sync';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { DraftState } from '../api/models/draft-state';
import { ProjectionData } from '../api/models/projection-data';
import { UpdateProjectionData } from '../api/models/update-projection-data';
import { SyncWarningDialogComponent } from './sync-warning-dialog/sync-warning-dialog';
import {
  FullSeasonConfig,
  FullSeasonDialogComponent,
} from './full-season-dialog/full-season-dialog';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { ShareDialogComponent } from './share-dialog/share-dialog';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { OffseasonDataNoticeComponent } from '../shared/offseason-data-notice/offseason-data-notice';
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
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { SharedPlayer } from '../api/models/shared-player';
import { YahooService } from '../services/yahoo.service';

const AUTOSAVE_DEBOUNCE_MS = 1200;

@Component({
  selector: 'app-draft-projection',
  imports: [
    LeagueSyncComponent,
    LeagueSyncDialogComponent,
    PlayerProjectionsTableComponent,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    SyncWarningDialogComponent,
    FullSeasonDialogComponent,
    OffseasonDataNoticeComponent,
    ShareDialogComponent,
    RouterLink,
    TooltipDirective,
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
  private readonly ranking = inject(ProjectionRankingService);
  private readonly projectionShare = inject(ProjectionShareService);
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
  readonly projectionId = signal<string | null>(null);
  private readonly projectionLoaded = signal<boolean>(false);
  private readonly autosaveEnabled = signal<boolean>(false);
  private lastSavedJson = '';
  private lastSavedPlayersJson = '';

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
  espnSync = signal<EspnSync | null>(null);
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
  readonly showFullSeasonDialog = signal<boolean>(false);
  readonly showShareDialog = signal<boolean>(false);
  readonly showSyncDialog = signal<boolean>(false);
  /**
   * The league these settings were imported from, whichever platform it was. A projection carries
   * at most one sync, so the two stamps are alternatives rather than a precedence.
   */
  readonly syncedLeagueName = computed(
    () => this.yahooSync()?.leagueName ?? this.espnSync()?.leagueName ?? null,
  );

  /** Which platform that league is on, so the toolbar can wear its mark. */
  readonly syncedProvider = computed<'yahoo' | 'espn' | null>(() => {
    if (this.yahooSync()) {
      return 'yahoo';
    }
    return this.espnSync() ? 'espn' : null;
  });

  /**
   * The rows a share would publish: the same ranking the table shows by default, frozen with the
   * player identity a public page has no way to look up. Computed lazily by the dialog's input
   * binding, so the cost lands only when someone actually opens it.
   */
  readonly sharedPlayers = computed<SharedPlayer[]>(() => {
    const projections = this.loadedProjections();
    if (!projections) {
      return [];
    }
    const ranked = this.ranking.rankOverall({
      projections,
      scoringType: this.scoringType(),
      statWeights: this.statWeights(),
      activeScoringColumns: this.activeScoringColumns(),
      leagueSize: this.leagueSize(),
      rosterSlots: this.rosterSlots(),
      minGoalieGames: this.minGoalieGames(),
      decimalSettings: this.decimalSettings(),
    });
    const playersById = new Map(this.players().map((player) => [player.id, player]));
    return this.projectionShare.toSharedPlayers(ranked, playersById, this.scoringType());
  });

  readonly isLoading = computed(() => this.playersResource.isLoading() || !this.projectionLoaded());

  /**
   * The resource settling is not the same as it having returned anything: it declares
   * `defaultValue: []`, and a 200 carrying an empty list never reaches the error effect below. An
   * editor with no player read model cannot rank, filter or name a single row, so it shows the
   * error state rather than a table that looks like an empty projection.
   */
  readonly playersUnavailable = computed(() => this.players().length === 0);

  reloadPlayers(): void {
    this.playersResource.reload();
  }

  readonly draftLinkLabel = computed(() => {
    const draft = this.draft();
    if (!draft) {
      return 'Draft mode';
    }
    return draft.finishedAt ? 'View draft summary' : 'Resume draft';
  });

  private readonly serializedState = computed(() =>
    this.autosaveEnabled() && !this.playersUnavailable()
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

  private applyLeagueSettings(mapped: LeagueProjectionSettingsResponse): void {
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
  }

  applyYahooSettings(result: YahooSyncResult): void {
    this.applyLeagueSettings(result.settings);
    this.yahooSync.set({
      leagueName: result.leagueName,
      leagueKey: result.leagueKey,
      syncedAt: new Date().toISOString(),
    });
    this.espnSync.set(null);
    this.syncedSnapshot.set(this.syncedSettingsKey());
  }

  applyEspnSettings(result: EspnSyncResult): void {
    this.applyLeagueSettings(result.settings);
    this.espnSync.set({
      // ESPN names the league in its settings response; the user only ever typed the id.
      leagueName: result.leagueName ?? result.leagueId,
      leagueId: result.leagueId,
      syncedAt: new Date().toISOString(),
    });
    // These settings are ESPN's now, so a Yahoo stamp would mislabel them — and `diverged`,
    // which watches for edits since a Yahoo sync, has nothing to say about them either.
    this.yahooSync.set(null);
    this.syncedSnapshot.set(null);
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
    this.espnSync.set(null);
    this.syncedSnapshot.set(null);
  }

  openFullSeasonDialog(): void {
    this.showFullSeasonDialog.set(true);
  }

  cancelFullSeason(): void {
    this.showFullSeasonDialog.set(false);
  }

  applyFullSeason(config: FullSeasonConfig): void {
    this.table()?.applyFullSeasonGames(config.scaleStats, config.minGamesToScale);
    this.showFullSeasonDialog.set(false);
  }

  private openExisting(id: string): void {
    this.projectionStorage
      .loadProjection(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          // A preset draft is not a projection anyone edits — it only holds the picks of a
          // draft started from a preset. Reaching this URL for one means the board is wanted.
          if (projection.kind === 'preset_draft') {
            void this.router.navigate(['/projections', projection.id, 'draft']);
            return;
          }
          this.projectionId.set(projection.id);
          this.projectionName.set(projection.name);
          const state = this.serializer.fromProjectionData(projection.data);
          this.applyState(state);
          const loaded = this.serializer.toProjectionData(state);
          this.lastSavedJson = JSON.stringify(loaded);
          this.lastSavedPlayersJson = JSON.stringify(loaded.players);
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
      espnSync: this.espnSync(),
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
    this.espnSync.set(state.espnSync);
    this.draft.set(state.draft);
    this.loadedProjections.set(state.playerProjections);
    this.syncedSnapshot.set(this.syncedSettingsKey());
  }

  private autosave(): void {
    const id = this.projectionId();
    // The pool check is the load-bearing one, not belt-and-braces on serializedState: without a
    // player read model the table holds nothing worth saving, and writing that back is how a
    // projection gets destroyed by a page that merely failed to load.
    if (!this.autosaveEnabled() || !id || this.playersUnavailable()) {
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
      .updateProjection(id, { name: this.projectionName(), data: this.payload(data) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.lastSavedPlayersJson = JSON.stringify(data.players);
          this.saveStatus.set('saved');
        },
        error: () => this.saveStatus.set('error'),
      });
  }

  /**
   * The update to send. The player rows are ~0.5 MB and most edits — a stat weight, a column,
   * a draft pick — leave them untouched, so they are sent only when they actually changed and
   * the server keeps the stored ones otherwise.
   *
   * The baseline is advanced only once a save has succeeded. Advancing it optimistically would
   * mean a failed save leaves the server holding the old rows while we believe it has the new
   * ones, and the next save would omit them — losing the edit in silence.
   */
  private payload(data: ProjectionData): UpdateProjectionData {
    if (JSON.stringify(data.players) === this.lastSavedPlayersJson) {
      return { settings: data.settings, draft: data.draft };
    }
    return data;
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
      .updateProjection(id, { name: newName, data: this.payload(data) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.projectionName.set(newName);
          this.lastSavedPlayersJson = JSON.stringify(data.players);
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
