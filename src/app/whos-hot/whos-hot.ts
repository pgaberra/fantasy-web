import { Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { environment } from '../../environments/environment';
import { EntitlementService } from '../services/entitlement.service';
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
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { FREE_PRESET, GameRangeSelectorComponent } from './game-range-selector/game-range-selector';
import {
  DEFAULT_SEASON_START_YEAR,
  SEASON_SCHEDULE_GAMES,
  SEASONS,
  seasonLabelOf,
} from './season.model';
import { HotPlayersTableComponent } from './hot-players-table/hot-players-table';

/**
 * How long the game range has to hold still before it is worth a request. Long enough that a
 * drag resolves to a single fetch, short enough that letting go feels immediate.
 */
const SPAN_SETTLE_MS = 250;

function isSameSpan(a: GameSpan, b: GameSpan): boolean {
  return a.season === b.season && a.fromGame === b.fromGame && a.toGame === b.toGame;
}

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
    HelpTipComponent,
  ],
  templateUrl: './whos-hot.html',
  styleUrl: './whos-hot.css',
})
export class WhosHotComponent {
  private readonly playerService = inject(PlayerService);
  private readonly whosHot = inject(WhosHotService);
  private readonly settingsStore = inject(WhosHotSettingsService);
  private readonly entitlement = inject(EntitlementService);

  protected readonly seasons = SEASONS;
  protected readonly scheduleLength = SEASON_SCHEDULE_GAMES;

  private readonly stored = this.settingsStore.load();

  readonly season = signal(this.stored?.season ?? DEFAULT_SEASON_START_YEAR);
  readonly seasonLabel = computed(() => seasonLabelOf(this.season()));

  /** The stretch a free account is held to, and the range every account opens on. */
  private readonly freeRange = FREE_PRESET.range(SEASON_SCHEDULE_GAMES);

  readonly fromGame = signal(this.stored?.fromGame ?? this.freeRange.from);
  readonly toGame = signal(this.stored?.toGame ?? this.freeRange.to);
  readonly perGame = signal(this.stored?.perGame ?? false);
  readonly minGames = signal(this.stored?.minGames ?? 1);

  /**
   * The minimum the leaderboard is actually filtered by. The number the user typed outlives the
   * range it was typed against: narrow the range afterwards and a minimum of 25 asks for more
   * games than a 23-game stretch holds, so every player is dropped and the page reads as broken
   * rather than over-filtered. Clamping here rather than rewriting `minGames` keeps the figure
   * they chose, so widening the range brings it back instead of making them type it again — a
   * drag passes through every narrow range on its way to a wide one, and a drag must not be able
   * to destroy the setting.
   */
  readonly appliedMinGames = computed(() =>
    Math.min(this.minGames(), Math.max(1, this.toGame() - this.fromGame() + 1)),
  );

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

  /**
   * Whether this account may pick its own range. Premium buys it; with payments switched off
   * nobody can, so nobody is held to the free range either. /pricing redirects home while the
   * flag is off, so locking the control then would point at a page that does not exist and
   * leave the range unbuyable rather than unbought.
   */
  readonly canPickRange = computed(
    () => !environment.paymentsEnabled || this.entitlement.premium(),
  );

  /**
   * The entitlement is a live fetch, and it reads as non-premium until it lands. Holding the
   * fallback below until it has settled keeps a premium account's stored range from being
   * snapped back to the last 10 in the moment before their subscription is known.
   */
  private readonly entitlementSettled = computed(
    () =>
      !environment.paymentsEnabled ||
      this.entitlement.loadState() === 'loaded' ||
      this.entitlement.loadState() === 'error',
  );

  readonly activeColumns = computed<ActiveColumns>(() => ({
    scoring: this.activeScoringColumns(),
    utility: this.activeUtilityColumns(),
  }));

  private readonly span = computed<GameSpan>(() => ({
    season: this.season(),
    fromGame: this.fromGame(),
    toGame: this.toGame(),
  }));

  /**
   * The span the server is actually asked about. Dragging a slider handle passes through every
   * game number on the way, and each one is a span of its own — fetching them all spends dozens
   * of requests on ranges nobody asked to see, enough of a burst that the edge rate limiter
   * starts rejecting them (and a rejected request reaches the browser as an opaque CORS failure,
   * so the page shows its error state rather than the range the user landed on). Waiting for the
   * range to settle spends one request on the range they meant. Ranges are compared by value, so
   * dragging away and back again costs nothing at all.
   */
  private readonly settledSpan = toSignal(
    toObservable(this.span).pipe(
      debounceTime(SPAN_SETTLE_MS),
      // The range the page opens on is worth a request straight away rather than a quarter
      // second later, and seeding it here also makes it the value the comparison below starts
      // from — so a drag that ends where it began settles back into silence.
      startWith(this.span()),
      distinctUntilChanged(isSameSpan),
    ),
    { requireSync: true },
  );

  private readonly playersResource = rxResource({
    stream: () => this.playerService.getPlayers(),
    defaultValue: [] as Player[],
  });

  private readonly splitsResource = rxResource({
    params: () => this.settledSpan(),
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
    /**
     * A range outlives the subscription that bought it: it is saved to this browser, so an
     * account that lapses (or one that was premium in another browser) would otherwise come back
     * to a custom range it can no longer change, with every control that could undo it switched
     * off. Put it back on the free range instead.
     */
    effect(() => {
      if (!this.entitlementSettled() || this.canPickRange()) {
        return;
      }
      this.fromGame.set(this.freeRange.from);
      this.toGame.set(this.freeRange.to);
    });

    effect(() => {
      this.settingsStore.save({
        season: this.season(),
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

  /** Only a season that is actually on offer: `Number('')` is 0, which is finite and is not one. */
  onSeasonChange(event: Event): void {
    const startYear = Number((event.target as HTMLSelectElement).value);
    if (this.seasons.some((season) => season.startYear === startYear)) {
      this.season.set(startYear);
    }
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
