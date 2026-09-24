import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { PlayerService } from '../services/player.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { Player } from '../models/player.model';
import { applyPositionOverrides, PositionOverrides } from '../models/position-override';
import { SkaterPosition } from '../models/position.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { Projection, ScoringType } from '../models/projection.model';
import { ManualRanking, PROJECTED_RANKING } from '../models/manual-ranking';
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
import { PlayerPoolNoticeComponent } from '../shared/player-pool-notice/player-pool-notice';
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
import { PlayerBasis, ProjectionState } from '../services/projection-serializer';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionSyncService, SyncedSettings } from '../services/projection-sync.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { SharedPlayer } from '../api/models/shared-player';
import { YahooService } from '../services/yahoo.service';
import { EspnService } from '../services/espn.service';
import { IconComponent } from '../shared/icon/icon';
import { LeagueImportButtonComponent } from '../shared/league-import-button/league-import-button';
import { ProjectionOrigin } from '../api/models/projection-origin';
import { renameOnOpenExtras, wantsRenameOnOpen } from './rename-intent';

/** Exported so the tests can wait out exactly this and not a round number they guessed at. */
export const AUTOSAVE_DEBOUNCE_MS = 1200;

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
    PlayerPoolNoticeComponent,
    ShareDialogComponent,
    RouterLink,
    TooltipDirective,
    IconComponent,
    LeagueImportButtonComponent,
  ],
  templateUrl: './draft-projection.html',
  styleUrl: './draft-projection.css',
})
export class DraftProjectionComponent implements OnInit, OnDestroy {
  private readonly playerService = inject(PlayerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statInfoService = inject(StatInfoService);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);
  private readonly projectionSync = inject(ProjectionSyncService);
  private readonly projectionShare = inject(ProjectionShareService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly notification = inject(NotificationService);
  private readonly location = inject(Location);

  /**
   * Whether the navigation that opened this page asked for the rename to be waiting — which the
   * two places that take a copy of a shared projection do, since the server names a copy after
   * the share it came from. Read here rather than in `ngOnInit` because the navigation is only
   * "current" while the component is being created, and spent immediately (see
   * {@link consumeRenameIntent}) so a reload does not open the rename a second time.
   */
  private readonly renameOnOpen = wantsRenameOnOpen(this.router.currentNavigation()?.extras.state);

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
  /**
   * The share link this projection follows, on a follow, and null on everything else. It is the
   * one thing that says a projection is a follow: `kind: 'imported'` does not, since a
   * spreadsheet import carries that kind and is the user's own rows.
   */
  readonly origin = signal<ProjectionOrigin | null>(null);
  /**
   * A follow is a mirror of somebody else's projection, rewritten whenever they share it again,
   * and the server keeps nothing this page could send but the draft. So the page does not offer
   * the controls: no rename, no settings, no columns, no editable stats, no Share. What it offers
   * instead is a copy, which is the user's own and editable.
   */
  readonly isFollow = computed(() => this.origin() !== null);
  readonly copyingFollow = signal(false);
  private readonly projectionLoaded = signal<boolean>(false);
  private readonly autosaveEnabled = signal<boolean>(false);
  private lastSavedJson = '';
  private lastSavedPlayersJson = '';
  /** The state as of the last change, whether or not the debounce has run out on it yet. */
  private pendingState: ProjectionState | null = null;

  private readonly playersResource = rxResource({
    stream: () => this.playerService.getPlayers(),
    defaultValue: [] as Player[],
  });
  /**
   * The pool this projection is drafted against: what the read model reports, with the owner's
   * corrections applied. Every reader downstream — the position filter, the row label, the
   * draft's slot eligibility, a published share — sees the corrected positions, because the
   * correction happens once here rather than at each of them.
   */
  readonly players = computed(() =>
    applyPositionOverrides(this.playersResource.value(), this.positionOverrides()),
  );

  scoringType = signal<ScoringType>('points');
  statWeights = signal<Record<ScoringStatKey, number>>(DEFAULT_STAT_WEIGHTS);

  activeScoringColumns = signal(new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS));
  activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS));
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
  /** Survives an unsync: the stamp is the claim, this is the league they import from. */
  lastEspnLeagueId = signal<string | null>(null);
  // Owned by the server: what the rows started as, and the sync they were last squared with.
  // Held here only so a save carries them back rather than dropping them.
  playerBasis = signal<PlayerBasis | null>(null);
  playerPoolSyncedAt = signal<string | null>(null);
  /**
   * The players the server added to match the pool that the owner has not acknowledged. Kept on
   * the projection, so the notice about them survives a reload; emptied by "Got it" and saved.
   */
  readonly unacknowledgedNewPlayerIds = signal<number[]>([]);

  /** Whether each half of the pool is ordered by its projections or by the owner, and that order. */
  readonly manualRanking = signal<ManualRanking>(PROJECTED_RANKING);

  /** Those players, as the table wants them; null when there are none. */
  readonly newPlayerIds = computed<ReadonlySet<number> | null>(() => {
    const ids = this.unacknowledgedNewPlayerIds();
    return ids.length ? new Set(ids) : null;
  });

  /** Whether the table is narrowed to them. The notice and the table share it. */
  readonly newPlayersOnly = signal(false);
  draft = signal<DraftState | null>(null);
  /** The positions the owner corrected by hand, keyed by player. Empty when none have been. */
  readonly positionOverrides = signal<PositionOverrides>(new Map());

  private readonly syncedSnapshot = signal<string | null>(null);
  /**
   * The synced settings themselves, not just the signature we compare against. The warning is
   * blocking, so it is raised by one edit and this is what putting that edit back means.
   */
  private readonly syncedSettings = signal<SyncedSettings | null>(null);
  private readonly currentSyncedSettings = computed<SyncedSettings>(() => ({
    scoringType: this.scoringType(),
    activeScoringColumns: this.activeScoringColumns(),
    activeUtilityColumns: this.activeUtilityColumns(),
    leagueSize: this.leagueSize(),
    rosterSlots: this.rosterSlots(),
    statWeights: this.statWeights(),
  }));
  private readonly syncedSettingsKey = computed(() =>
    this.projectionSync.settingsSignature(this.currentSyncedSettings()),
  );
  readonly diverged = computed(() =>
    this.projectionSync.hasDiverged(
      this.yahooSync() ?? this.espnSync(),
      this.syncedSettingsKey(),
      this.syncedSnapshot(),
    ),
  );
  readonly reSyncing = signal<boolean>(false);
  readonly reSyncError = signal<string | null>(null);
  readonly showFullSeasonDialog = signal<boolean>(false);
  readonly showShareDialog = signal<boolean>(false);
  /**
   * The import dialog, open from the start when this page is where a Yahoo connect started in it
   * comes back to: the consent reloads the page, and the dialog is where the user was left.
   */
  protected readonly backFromYahoo = inject(YahooConnectReturnService).returnedTo(this.router.url);
  readonly showSyncDialog = signal<boolean>(this.backFromYahoo);
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
   * The rows a share would publish, from the board as it stands. The edited rows live in the
   * table, which is why this goes through {@link buildState} rather than `loadedProjections`:
   * reading those published the stats the projection was opened with, whatever had been edited
   * since. Computed lazily by the dialog's input binding, so the cost lands only when someone
   * actually opens it.
   */
  readonly sharedPlayers = computed<SharedPlayer[]>(() =>
    this.projectionShare.rowsToPublish(this.buildState(), this.playersResource.value()),
  );

  /**
   * Whether this projection has a public link. A shared projection is published again after
   * every save, so the link follows it. Null until the first save has asked, and again after an
   * answer that failed, so the next save asks again rather than guessing.
   */
  private readonly isShared = signal<boolean | null>(null);

  readonly isLoading = computed(() => this.playersResource.isLoading() || !this.projectionLoaded());

  /**
   * The resource settling is not the same as it having returned anything: it declares
   * `defaultValue: []`, and a 200 carrying an empty list never reaches the error effect below. An
   * editor with no player read model cannot rank, filter or name a single row, so it shows the
   * error state rather than a table that looks like an empty projection.
   */
  readonly playersUnavailable = computed(() => this.players().length === 0);
  readonly playersLoadFailure = computed(() => this.playersResource.error());

  reloadPlayers(): void {
    this.playersResource.reload();
  }

  readonly draftLinkLabel = computed(() => {
    const draft = this.draft();
    if (!draft) {
      return 'Draft Mode';
    }
    return draft.finishedAt ? 'View draft summary' : 'Resume draft';
  });

  /**
   * Every piece of state a save would carry, rebuilt whenever any of it changes — which is what
   * arms the debounce below. It deliberately stops at the state object: serializing it is ~0.5 MB
   * of JSON and this is read on every change detection pass, so doing it here charged the full
   * cost to every keystroke and every column tick, only to have the debounce throw the result
   * away. `autosave` serializes once, after the typing stops, and compares against the last save.
   */
  private readonly saveableState = computed(() =>
    this.autosaveEnabled() && !this.playersUnavailable() ? this.buildState() : null,
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
        const input = this.renameInput()?.nativeElement;
        input?.focus();
        // Selected, not merely focused: a rename always starts from the name that is already
        // there, and on a fresh copy ("Copy of My league") that name is the one thing the user
        // is here to replace. Typing then replaces it instead of appending to it.
        input?.select();
      }
    });
    toObservable(this.saveableState)
      .pipe(
        // Held on to before the debounce, so the save on the way out has the rows as they were
        // while the table was still alive rather than having to ask a component being destroyed.
        tap((state) => (this.pendingState = state ?? this.pendingState)),
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.autosave());
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/projections']);
      return;
    }
    this.consumeRenameIntent();
    this.openExisting(id);
  }

  /**
   * Strips the rename intent out of the history entry this page is sitting on. Navigation state
   * is restored with the entry on a reload, so without this a copy opened ready to be renamed
   * would reopen the rename on every refresh of that URL and on every press of Back onto it.
   */
  private consumeRenameIntent(): void {
    if (this.renameOnOpen) {
      this.location.replaceState(this.location.path(true), '', {});
    }
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
    this.rememberSyncedSettings();
    this.closeSyncDialogUnlessThereIsMoreToSay(result.settings.unsupportedStats);
  }

  applyEspnSettings(result: EspnSyncResult): void {
    this.applyLeagueSettings(result.settings);
    this.espnSync.set({
      // ESPN names the league in its settings response; the user only ever typed the id.
      leagueName: result.leagueName ?? result.leagueId,
      leagueId: result.leagueId,
      syncedAt: new Date().toISOString(),
    });
    this.lastEspnLeagueId.set(result.leagueId);
    // These settings are ESPN's now, so a Yahoo stamp would mislabel them.
    this.yahooSync.set(null);
    this.rememberSyncedSettings();
    this.closeSyncDialogUnlessThereIsMoreToSay(result.settings.unsupportedStats);
  }

  /**
   * A sync that had nothing to report is finished the moment it lands, so the dialog gets out of
   * the way and the toolbar states the league it came from. One that could not map every stat
   * keeps the dialog open: that list is the only place the user is told their league scores
   * something this projection cannot hold.
   */
  private closeSyncDialogUnlessThereIsMoreToSay(unsupportedStats: string[]): void {
    if (!unsupportedStats.length) {
      this.showSyncDialog.set(false);
    }
  }

  /** Pulls the league's current settings again — the answer for an edit that the league itself made. */
  reSync(): void {
    if (this.reSyncing()) {
      return;
    }
    const yahoo = this.yahooSync();
    const espn = this.espnSync();
    if (yahoo) {
      this.runReSync(this.yahoo.leagueProjectionSettings(yahoo.leagueKey), 'Yahoo', (settings) =>
        this.applyYahooSettings({
          settings,
          leagueName: yahoo.leagueName,
          leagueKey: yahoo.leagueKey,
        }),
      );
    } else if (espn) {
      // The league id is all ESPN needs from us; any cookies a private league wants are the
      // pair already stored server-side.
      this.runReSync(this.espn.leagueProjectionSettings(espn.leagueId), 'ESPN', (settings) =>
        this.applyEspnSettings({
          settings,
          leagueId: espn.leagueId,
          leagueName: settings.leagueName ?? espn.leagueName,
        }),
      );
    }
  }

  private runReSync(
    request: Observable<LeagueProjectionSettingsResponse>,
    platform: string,
    apply: (settings: LeagueProjectionSettingsResponse) => void,
  ): void {
    this.reSyncing.set(true);
    this.reSyncError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (settings) => {
        apply(settings);
        this.reSyncing.set(false);
      },
      error: () => {
        this.reSyncing.set(false);
        this.reSyncError.set(`Could not re-sync from ${platform}. Please try again.`);
      },
    });
  }

  private rememberSyncedSettings(): void {
    this.syncedSnapshot.set(this.syncedSettingsKey());
    this.syncedSettings.set(this.currentSyncedSettings());
  }

  /**
   * The way out of the warning that keeps the league: put back what it was synced with. The
   * dialog blocks the page from the first edit onwards, so this undoes that edit and no more.
   */
  revertToSyncedSettings(): void {
    const synced = this.syncedSettings();
    if (!synced) {
      return;
    }
    this.scoringType.set(synced.scoringType);
    this.activeScoringColumns.set(new Set(synced.activeScoringColumns));
    this.activeUtilityColumns.set(new Set(synced.activeUtilityColumns));
    this.leagueSize.set(synced.leagueSize);
    this.rosterSlots.set({ ...synced.rosterSlots });
    this.statWeights.set({ ...synced.statWeights });
  }

  /**
   * "These settings are mine now." Only the claim goes — `lastEspnLeagueId` stays, so the next
   * import starts from the league they were on rather than asking for the id again.
   */
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
    this.table()?.applyFullSeasonGames(
      config.scaleStats,
      config.minGamesToScale,
      config.scaleGoalies,
    );
    this.showFullSeasonDialog.set(false);
  }

  private openExisting(id: string): void {
    this.projectionStorage
      .loadProjection(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          // A draft is not a projection anyone edits — it holds picks, and a copy of the
          // board they were made against. Reaching this URL for one means the draft is wanted.
          if (projection.kind === 'draft') {
            void this.router.navigate(['/drafts', projection.id]);
            return;
          }
          this.projectionId.set(projection.id);
          this.projectionName.set(projection.name);
          this.origin.set(projection.origin ?? null);
          const state = this.serializer.fromProjectionData(projection.data);
          this.applyState(state);
          const loaded = this.serializer.toProjectionData(state);
          this.lastSavedJson = JSON.stringify(loaded);
          this.lastSavedPlayersJson = JSON.stringify(loaded.players);
          this.projectionLoaded.set(true);
          // A follow has nothing to autosave: the page offers no control that changes it, and the
          // server would keep only the draft out of anything sent anyway.
          this.autosaveEnabled.set(!this.isFollow());
          if (this.renameOnOpen && !this.isFollow()) {
            this.startRename();
          }
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
      lastEspnLeagueId: this.lastEspnLeagueId(),
      playerBasis: this.playerBasis(),
      playerPoolSyncedAt: this.playerPoolSyncedAt(),
      unacknowledgedNewPlayerIds: this.unacknowledgedNewPlayerIds(),
      manualRanking: this.manualRanking(),
      draft: this.draft(),
      positionOverrides: this.positionOverrides(),
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
    this.lastEspnLeagueId.set(state.lastEspnLeagueId);
    this.playerBasis.set(state.playerBasis);
    this.playerPoolSyncedAt.set(state.playerPoolSyncedAt);
    this.unacknowledgedNewPlayerIds.set(state.unacknowledgedNewPlayerIds);
    this.manualRanking.set(state.manualRanking);
    this.draft.set(state.draft);
    this.positionOverrides.set(state.positionOverrides);
    this.loadedProjections.set(state.playerProjections);
    this.rememberSyncedSettings();
  }

  /**
   * Corrects one skater's positions, or puts them back on the read model's when given null.
   * Autosaves like any other edit: the state this builds is what the save watches.
   *
   * <p>Ticking a position and unticking it again lands back on the read model's answer, and that
   * is no correction: it counted as a change in the header, and once saved it would pin the
   * player there if the pool later gave him a position. So the default comes out of the map.
   */
  onPositionsChanged(change: { playerId: number; positions: SkaterPosition[] | null }): void {
    this.positionOverrides.update((current) => {
      const next = new Map(current);
      if (change.positions === null || this.isDefaultPositions(change.playerId, change.positions)) {
        next.delete(change.playerId);
      } else {
        next.set(change.playerId, change.positions);
      }
      return next;
    });
  }

  private isDefaultPositions(playerId: number, positions: readonly SkaterPosition[]): boolean {
    const reported = this.playersResource.value().find((player) => player.id === playerId);
    return (
      reported?.type === 'skater' &&
      reported.positions.size === positions.length &&
      positions.every((position) => reported.positions.has(position))
    );
  }

  /**
   * The owner has seen the new players. The filter goes with the list, since the notice was the
   * only place to turn it off.
   *
   * <p>Saved on the spot rather than left to the debounce. Every other edit here is one of a run
   * — a keystroke, a column tick — and waiting for the run to end is the whole point; this one is
   * a single click on a notice that then disappears, and what people do next is leave. That
   * cancelled the pending save with `takeUntilDestroyed`, so the acknowledgement was lost and the
   * notice came back on the next open, having been dismissed. The debounce still fires afterwards
   * and finds nothing to do: `autosave` compares against the payload it last sent.
   */
  acknowledgeNewPlayers(): void {
    this.unacknowledgedNewPlayerIds.set([]);
    this.newPlayersOnly.set(false);
    this.autosave();
  }

  /** Drops every correction at once, putting the whole pool back on the reported positions. */
  onPositionsReset(): void {
    this.positionOverrides.set(new Map());
  }

  /**
   * Leaving the page is what the debounce cannot survive: the pending save is cancelled with the
   * component, so an edit made inside the last {@link AUTOSAVE_DEBOUNCE_MS} was lost — and the
   * last edit before leaving is the likeliest one there is. It goes out here instead, detached,
   * because the request has to outlive the component that started it.
   *
   * <p>This covers leaving the page, not leaving the app: closing or reloading the tab never
   * reaches a destroy hook, and a browser will not wait for a request on the way out either.
   * Anything that must be kept is saved on its own action — see {@link acknowledgeNewPlayers}.
   */
  ngOnDestroy(): void {
    if (this.pendingState) {
      this.save(this.pendingState, { cancelOnDestroy: false });
    }
  }

  private autosave(): void {
    this.save(this.buildState(), { cancelOnDestroy: true });
  }

  /**
   * @param cancelOnDestroy whether the request goes with the page. Every save but the last one
   *     does: there is another behind it, and a component that is gone has nothing to do with the
   *     answer. The save on the way out is the exception, since cancelling it is the bug.
   */
  private save(state: ProjectionState, { cancelOnDestroy }: { cancelOnDestroy: boolean }): void {
    const id = this.projectionId();
    // The pool check is the load-bearing one, not belt-and-braces on serializedState: without a
    // player read model the table holds nothing worth saving, and writing that back is how a
    // projection gets destroyed by a page that merely failed to load.
    if (!this.autosaveEnabled() || !id || this.playersUnavailable()) {
      return;
    }
    const data = this.serializer.toProjectionData(state);
    const json = JSON.stringify(data);
    if (json === this.lastSavedJson) {
      return;
    }
    // Moved on with the save, so the flush on the way out does not send an older state back over
    // one that was saved on its own action since.
    this.pendingState = state;
    this.lastSavedJson = json;
    this.saveStatus.set('saving');
    // Taken now: the save on the way out answers after the component, and its resource, are gone.
    const pool = this.playersResource.value();
    const save = this.projectionStorage
      .updateProjection(id, { name: this.projectionName(), data: this.payload(data) })
      .pipe(
        tap(() => (this.lastSavedPlayersJson = JSON.stringify(data.players))),
        // Not "saved" until the link shows it too, or the status would say done over a page
        // still showing the board from before.
        switchMap(() => this.publishIfShared(id, state, pool)),
      );
    (cancelOnDestroy ? save.pipe(takeUntilDestroyed(this.destroyRef)) : save).subscribe({
      next: () => this.saveStatus.set('saved'),
      error: () => this.saveStatus.set('error'),
    });
  }

  /**
   * Publishes the board again when the projection has a link, so the link shows what was just
   * saved. It runs after the save rather than beside it because the server copies the settings,
   * name and position corrections from the stored projection, and only the rows from here.
   */
  private publishIfShared(id: string, state: ProjectionState, pool: Player[]): Observable<unknown> {
    const known = this.isShared();
    return (known === null ? this.checkShared(id) : of(known)).pipe(
      switchMap((shared) =>
        shared
          ? this.projectionShare.share(id, this.projectionShare.rowsToPublish(state, pool))
          : of(null),
      ),
    );
  }

  private checkShared(id: string): Observable<boolean> {
    return this.projectionShare.getShare(id).pipe(
      map(() => true),
      // Not shared is a 404, the normal answer for most projections, not a failure.
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404
          ? of(false)
          : throwError(() => error),
      ),
      tap((shared) => this.isShared.set(shared)),
    );
  }

  /** Published from the dialog: from here on, every save publishes again. */
  onShared(): void {
    this.isShared.set(true);
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
      return {
        settings: data.settings,
        draft: data.draft,
        positionOverrides: data.positionOverrides,
      };
    }
    return data;
  }

  /**
   * Takes a copy of the projection this one follows, and opens it. The copy is the user's own:
   * editable, shareable, and untouched by anything the author publishes afterwards. It goes
   * through the share token rather than this projection's id, because a copy is of what is
   * published now, and a follow may be a moment behind it.
   */
  createCopy(): void {
    const origin = this.origin();
    if (!origin || this.copyingFollow()) {
      return;
    }
    this.copyingFollow.set(true);
    this.projectionStorage
      .copyFromShare(origin.shareToken)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (copy) => {
          this.copyingFollow.set(false);
          void this.router.navigate(['/projections', copy.id], renameOnOpenExtras);
        },
        error: (error: unknown) => {
          this.copyingFollow.set(false);
          // The follow goes when the share does, so a 404 here means the author has just taken
          // the link down and this page is about to be a projection that no longer exists.
          const gone = error instanceof HttpErrorResponse && error.status === 404;
          this.notification.error(
            gone
              ? 'That share link is no longer active.'
              : "Couldn't copy this projection. Please try again.",
          );
        },
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

    const state = this.buildState();
    const pool = this.playersResource.value();
    const data = this.serializer.toProjectionData(state);
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
          // The name is on the public page too. A failure here is not the rename's: that landed.
          this.publishIfShared(id, state, pool)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ error: () => this.saveStatus.set('error') });
        },
        error: (error: unknown) => {
          this.renameSaving.set(false);
          const conflict = error instanceof HttpErrorResponse && error.status === 409;
          this.renameError.set(
            conflict
              ? 'A projection with that name already exists.'
              : "Couldn't rename the projection.",
          );
        },
      });
  }
}
