import { Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { PlayerService } from '../services/player.service';
import { Player } from '../models/player.model';
import { GameSpan, WhosHotService } from '../services/whos-hot.service';
import { WhosHotSettingsService } from '../services/whos-hot-settings.service';
import { ActiveColumns, ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';
import { EspnSync } from '../api/models/espn-sync';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { LeagueSyncComponent } from '../draft-projection/projection-settings-section/league-sync/league-sync';
import { LeagueSyncDialogComponent } from '../draft-projection/league-sync-dialog/league-sync-dialog';
import { YahooSyncResult } from '../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from '../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { GameRangeSelectorComponent } from './game-range-selector/game-range-selector';
import { HotPlayersTableComponent } from './hot-players-table/hot-players-table';

/**
 * The only season on offer for now. The feature is built to work mid-season too — the range is
 * expressed in team game numbers, which exist as soon as games are played — but until more
 * seasons are ingested there is nothing to choose between, so this is a constant rather than a
 * selector the user would find has one option.
 */
const SEASON_START_YEAR = 2025;
const SEASON_LABEL = '2025-26';
const SEASON_SCHEDULE_GAMES = 82;

const DEFAULT_SPAN_LENGTH = 20;

/**
 * Who's hot: which players actually produced best over a stretch of the schedule.
 *
 * These are measured totals, not projections, and the page reuses the projection editor's
 * league toolbar and sync on purpose — "best" only means anything relative to how your league
 * scores, so the same controls decide it here, in the same place: on the table they act on.
 */
@Component({
  selector: 'app-whos-hot',
  imports: [
    LeagueSyncComponent,
    LeagueSyncDialogComponent,
    GameRangeSelectorComponent,
    HotPlayersTableComponent,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    TooltipDirective,
  ],
  templateUrl: './whos-hot.html',
  styleUrl: './whos-hot.css',
})
export class WhosHotComponent {
  private readonly playerService = inject(PlayerService);
  private readonly whosHot = inject(WhosHotService);
  private readonly settingsStore = inject(WhosHotSettingsService);

  protected readonly seasonLabel = SEASON_LABEL;
  protected readonly scheduleLength = SEASON_SCHEDULE_GAMES;

  private readonly stored = this.settingsStore.load();

  readonly fromGame = signal(
    this.stored?.fromGame ?? SEASON_SCHEDULE_GAMES - DEFAULT_SPAN_LENGTH + 1,
  );
  readonly toGame = signal(this.stored?.toGame ?? SEASON_SCHEDULE_GAMES);
  readonly perGame = signal(this.stored?.perGame ?? false);
  readonly minGames = signal(this.stored?.minGames ?? 1);

  readonly scoringType = signal<ScoringType>(this.stored?.scoringType ?? 'points');
  readonly statWeights = signal<Record<ScoringStatKey, number>>(
    this.stored?.statWeights ?? DEFAULT_STAT_WEIGHTS,
  );
  readonly activeScoringColumns = signal(
    new Set<ScoringStatKey>(this.stored?.activeScoringColumns ?? DEFAULT_SCORING_COLUMNS),
  );
  readonly activeUtilityColumns = signal(
    new Set<SkaterUtilityStatKey>(this.stored?.activeUtilityColumns ?? DEFAULT_UTILITY_COLUMNS),
  );
  readonly leagueSize = signal(this.stored?.leagueSize ?? DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = signal<RosterSlots>(this.stored?.rosterSlots ?? DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = signal(this.stored?.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES);
  readonly yahooSync = signal<YahooSync | null>(this.stored?.yahooSync ?? null);
  readonly espnSync = signal<EspnSync | null>(this.stored?.espnSync ?? null);
  /** Kept past an import from elsewhere, so returning to ESPN doesn't ask for the id again. */
  readonly lastEspnLeagueId = signal<string | null>(this.stored?.lastEspnLeagueId ?? null);
  readonly showSyncDialog = signal<boolean>(false);

  /**
   * The league these settings came from, whichever platform it was. The leaderboard is scored by
   * one league at a time, so the two stamps are alternatives rather than a precedence.
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

  readonly activeColumns = computed<ActiveColumns>(() => ({
    scoring: this.activeScoringColumns(),
    utility: this.activeUtilityColumns(),
  }));

  private readonly span = computed<GameSpan>(() => ({
    season: SEASON_START_YEAR,
    fromGame: this.fromGame(),
    toGame: this.toGame(),
  }));

  private readonly playersResource = rxResource({
    stream: () => this.playerService.getPlayers(),
    defaultValue: [] as Player[],
  });

  private readonly splitsResource = rxResource({
    params: () => this.span(),
    stream: ({ params }) => this.whosHot.splits(params),
    defaultValue: [],
  });

  readonly players = computed(() => this.playersResource.value());
  readonly hotPlayers = computed(() => this.splitsResource.value());
  readonly isLoading = computed(
    () => this.playersResource.isLoading() || this.splitsResource.isLoading(),
  );
  readonly hasError = computed(
    () => !!this.playersResource.error() || !!this.splitsResource.error(),
  );

  constructor() {
    effect(() => {
      this.settingsStore.save({
        fromGame: this.fromGame(),
        toGame: this.toGame(),
        perGame: this.perGame(),
        minGames: this.minGames(),
        scoringType: this.scoringType(),
        statWeights: this.statWeights(),
        activeScoringColumns: this.activeScoringColumns(),
        activeUtilityColumns: this.activeUtilityColumns(),
        leagueSize: this.leagueSize(),
        rosterSlots: this.rosterSlots(),
        minGoalieGames: this.minGoalieGames(),
        yahooSync: this.yahooSync(),
        espnSync: this.espnSync(),
        lastEspnLeagueId: this.lastEspnLeagueId(),
      });
    });
  }

  retry(): void {
    if (this.playersResource.error()) {
      this.playersResource.reload();
    }
    if (this.splitsResource.error()) {
      this.splitsResource.reload();
    }
  }

  applyYahooSettings(result: YahooSyncResult): void {
    this.applyLeagueSettings(result.settings);
    this.yahooSync.set({
      leagueName: result.leagueName,
      leagueKey: result.leagueKey,
      syncedAt: new Date().toISOString(),
    });
    // These settings are Yahoo's now, so an ESPN stamp would mislabel them.
    this.espnSync.set(null);
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
    this.closeSyncDialogUnlessThereIsMoreToSay(result.settings.unsupportedStats);
  }

  /**
   * A sync that had nothing to report is finished the moment it lands, so the dialog gets out of
   * the way and the toolbar states the league it came from. One that could not map every stat
   * keeps the dialog open: that list is the only place the user is told their league scores
   * something this leaderboard cannot rank on.
   */
  private closeSyncDialogUnlessThereIsMoreToSay(unsupportedStats: string[]): void {
    if (!unsupportedStats.length) {
      this.showSyncDialog.set(false);
    }
  }

  private applyLeagueSettings(settings: LeagueProjectionSettingsResponse): void {
    this.scoringType.set(settings.scoringType);
    this.activeScoringColumns.set(new Set(settings.activeScoringColumns as ScoringStatKey[]));
    this.activeUtilityColumns.set(new Set(settings.activeUtilityColumns as SkaterUtilityStatKey[]));
    if (settings.leagueSize != null) {
      this.leagueSize.set(settings.leagueSize);
    }
    this.rosterSlots.set(settings.rosterSlots);
    if (settings.statWeights) {
      this.statWeights.set(settings.statWeights as Record<ScoringStatKey, number>);
    }
  }
}
