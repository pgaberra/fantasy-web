import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { ProjectionSettingsSectionComponent } from '../../draft-projection/projection-settings-section/projection-settings-section';
import { PlayerService } from '../../services/player.service';
import { StatInfoService } from '../../services/stat-info.service';
import { PendingProjectionService } from '../../services/pending-projection.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { ProjectionState } from '../../services/projection-serializer';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import { OffseasonDataNoticeComponent } from '../../shared/offseason-data-notice/offseason-data-notice';
import { ActiveColumns, ScoringType } from '../../models/projection.model';
import { Player } from '../../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../models/stat-key.model';
import { RosterSlots } from '../../api/models/roster-slots';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from '../../draft-projection/projection-settings-section/model';
import {
  createDefaultScaleSettings,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../../draft-projection/projection-defaults';
import { environment } from '../../../environments/environment';

/**
 * How much of the player list the demo shows. The BFF still sends every player — the editor
 * needs them all to rank and score — but only the top slice is rendered, because seeing the
 * whole board is the thing an account buys you.
 */
const DEMO_VISIBLE_PLAYERS = 50;

@Component({
  selector: 'app-landing-demo',
  imports: [
    RouterLink,
    ProjectionSettingsSectionComponent,
    PlayerProjectionsTableComponent,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    OffseasonDataNoticeComponent,
  ],
  templateUrl: './landing-demo.html',
  styleUrl: './landing-demo.css',
})
export class LandingDemoComponent {
  private readonly playerService = inject(PlayerService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly pendingProjection = inject(PendingProjectionService);
  private readonly router = inject(Router);

  protected readonly espnEnabled = environment.espnLeaguesEnabled;
  // Naming a platform whose sync is turned off would advertise something the editor then
  // doesn't offer, which is what happened on staging while Yahoo was down for the off-season.
  protected readonly syncablePlatforms = [
    environment.yahooSyncDisabled ? null : 'Yahoo',
    environment.espnLeaguesEnabled ? 'ESPN' : null,
  ]
    .filter(Boolean)
    .join(' or ');
  // The teaser disappears entirely when no platform can be synced at all, mirroring
  // app-league-sync in the signed-in editor rather than advertising a dead end. ESPN staying
  // available through the Yahoo off-season keeps the call to action live.
  protected readonly syncDisabled =
    environment.yahooSyncDisabled && !environment.espnLeaguesEnabled;

  protected readonly visiblePlayers = DEMO_VISIBLE_PLAYERS;

  private readonly table = viewChild(PlayerProjectionsTableComponent);

  readonly playersResource = rxResource({
    stream: () => this.playerService.getPlayers(),
    defaultValue: [] as Player[],
  });
  readonly players = computed(() => this.playersResource.value());

  // Same editable state as the signed-in editor (draft-projection), so the demo IS the
  // real editor — the only difference is that saving requires an account.
  readonly scoringType = signal<ScoringType>('points');
  readonly statWeights = signal<Record<ScoringStatKey, number>>({ ...DEFAULT_STAT_WEIGHTS });
  readonly activeScoringColumns = signal(new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS));
  readonly activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS));
  readonly activeColumns = computed<ActiveColumns>(() => ({
    scoring: this.activeScoringColumns(),
    utility: this.activeUtilityColumns(),
  }));
  readonly scaleSettings = signal<Record<SkaterUtilityStatKey, ScaleConfig>>(
    createDefaultScaleSettings((key) => this.statInfoService.isRateStat(key)),
  );
  readonly decimalSettings = signal<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = signal<boolean>(true);
  readonly leagueSize = signal<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = signal<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = signal<number>(DEFAULT_MIN_GOALIE_GAMES);

  retryLoad(): void {
    this.playersResource.reload();
  }

  /**
   * Hand the demo's edits off to the sign-up: stash them, then send the visitor to register.
   * The projections list redeems the stash once they're authenticated, so the work they did
   * here survives the round trip instead of dying with this component.
   */
  saveProjection(): void {
    this.pendingProjection.stash(this.serializer.toProjectionData(this.buildState()));
    void this.router.navigate(['/register']);
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
      yahooSync: null,
      espnSync: null,
      lastEspnLeagueId: null,
      // The demo's rows are every player's real stats, which is what a projection seeded from
      // last season starts as — so one redeemed into an account keeps being topped up that way.
      playerBasis: 'last_season',
      playerPoolSyncedAt: null,
      draft: null,
      playerProjections: this.table()?.playerProjections?.() ?? [],
    };
  }
}
