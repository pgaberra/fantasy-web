import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../../draft-projection/projection-defaults';
import { ScoringStatKey } from '../../models/stat-key.model';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { EspnService } from '../../services/espn.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import {
  FreeAgent,
  StreamerPlannerFreeAgentsService,
} from '../../services/streamer-planner-free-agents.service';
import {
  PlannerLeague,
  PlannerPlatform,
  StreamerPlannerLeagueService,
} from '../../services/streamer-planner-league.service';
import { YahooService } from '../../services/yahoo.service';

/** The position tabs, in the order a lineup lists them. "All" is every available player. */
export const POSITION_TABS = ['All', 'C', 'LW', 'RW', 'D', 'G'] as const;
export type PositionTab = (typeof POSITION_TABS)[number];

/** How many rows a tab shows. Deeper than anyone streams, shallow enough to read. */
const ROWS_PER_TAB = 25;

export interface RankedFreeAgent {
  player: FreeAgent;
  score: number;
  rank: number;
}

/**
 * The best players a league has available over the chosen week, by the league's own scoring.
 *
 * <p>The server sends the model's projected line for the week; the ranking happens here, with the
 * same engine that ranks a projection, because "best" only means anything against the settings
 * the league actually plays by.
 */
@Component({
  selector: 'app-free-agents',
  imports: [ErrorStateComponent, FormsModule, HelpTipComponent, LoadingIndicatorComponent],
  templateUrl: './free-agents.html',
  styleUrl: './free-agents.css',
})
export class FreeAgentsComponent {
  private readonly freeAgentsService = inject(StreamerPlannerFreeAgentsService);
  private readonly leagueService = inject(StreamerPlannerLeagueService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);

  /** The week the planner is showing, as ISO dates. */
  readonly start = input.required<string>();
  readonly end = input.required<string>();

  readonly league = this.leagueService.league;
  readonly tab = signal<PositionTab>('All');
  readonly tabs = POSITION_TABS;
  readonly picking = signal(false);
  readonly platform = signal<PlannerPlatform>('YAHOO');
  readonly espnLeagueId = signal('');
  readonly chosenYahooLeague = signal('');

  /** Whether the picker is on screen: it is, until a league is chosen, and again on "Change". */
  readonly choosing = computed(() => !this.league() || this.picking());

  private readonly yahooLeaguesResource = rxResource({
    params: () => (this.choosing() && this.platform() === 'YAHOO' ? true : undefined),
    stream: () => this.yahoo.myLeagues(),
  });

  readonly yahooLeagues = computed(() =>
    this.yahooLeaguesResource.hasValue() ? this.yahooLeaguesResource.value().leagues : [],
  );
  readonly yahooFailed = computed(() => !!this.yahooLeaguesResource.error());

  private readonly settingsResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) =>
      params.platform === 'YAHOO'
        ? this.yahoo.leagueProjectionSettings(params.leagueId)
        : this.espn.leagueProjectionSettings(params.leagueId),
  });

  private readonly freeAgentsResource = rxResource({
    params: () => {
      const league = this.league();
      return league ? { league, start: this.start(), end: this.end() } : undefined;
    },
    stream: ({ params }) =>
      this.freeAgentsService.freeAgents(
        params.league.platform,
        params.league.leagueId,
        params.start,
        params.end,
      ),
  });

  readonly isLoading = computed(
    () => this.freeAgentsResource.isLoading() || this.settingsResource.isLoading(),
  );
  readonly loadFailure = computed(
    () => this.freeAgentsResource.error() ?? this.settingsResource.error(),
  );
  readonly unprojected = computed(() =>
    this.freeAgentsResource.hasValue() ? this.freeAgentsResource.value().unprojected : 0,
  );

  /** The league's own scoring, or the app's defaults until its settings land. */
  private readonly scoring = computed(() => {
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    return {
      scoringType: settings?.scoringType ?? 'points',
      statWeights: {
        ...DEFAULT_STAT_WEIGHTS,
        ...((settings?.statWeights ?? {}) as Record<ScoringStatKey, number>),
      },
      // The columns the league actually scores, as its own settings report them. Falling back to
      // the app's defaults would price categories this league does not play.
      activeScoringColumns: new Set(
        (settings?.activeScoringColumns as ScoringStatKey[] | undefined) ?? DEFAULT_SCORING_COLUMNS,
      ),
    };
  });

  readonly scoringType = computed(() => this.scoring().scoringType);

  readonly ranked = computed<RankedFreeAgent[]>(() => {
    const week = this.freeAgentsResource.hasValue() ? this.freeAgentsResource.value() : null;
    if (!week) {
      return [];
    }
    const byPlayerId = new Map(week.players.map((player) => [player.projection.playerId, player]));
    const scoring = this.scoring();
    const scored = this.ranking.rankOverall({
      projections: week.players.map((player) => player.projection),
      scoringType: scoring.scoringType,
      statWeights: scoring.statWeights,
      activeScoringColumns: scoring.activeScoringColumns,
      leagueSize: DEFAULT_LEAGUE_SIZE,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      // A goalie streamed for one week has nothing like a season's starts behind him, and the
      // minimum is there to keep a backup off a season table. Applied here it would disqualify
      // every goalie on the page.
      minGoalieGames: 0,
      decimalSettings: {},
    });
    const ranked: RankedFreeAgent[] = [];
    for (const [index, entry] of scored.entries()) {
      const player = byPlayerId.get(entry.projection.playerId);
      if (player) {
        ranked.push({
          player,
          score: scoring.scoringType === 'points' ? entry.score.fantasyPoints : entry.score.zScore,
          rank: index + 1,
        });
      }
    }
    return ranked;
  });

  readonly rows = computed(() => {
    const tab = this.tab();
    const matching =
      tab === 'All'
        ? this.ranked()
        : this.ranked().filter((row) => row.player.positions.includes(tab));
    return matching.slice(0, ROWS_PER_TAB);
  });

  readonly isEmpty = computed(
    () => !this.isLoading() && !this.loadFailure() && this.ranked().length === 0,
  );

  startPicking(): void {
    this.picking.set(true);
  }

  cancelPicking(): void {
    this.picking.set(false);
  }

  chooseYahoo(leagueKey: string, name: string): void {
    this.leagueService.choose({ platform: 'YAHOO', leagueId: leagueKey, name });
    this.picking.set(false);
  }

  chooseEspn(): void {
    const leagueId = this.espnLeagueId().trim();
    if (leagueId) {
      this.leagueService.choose({ platform: 'ESPN', leagueId, name: `ESPN league ${leagueId}` });
      this.picking.set(false);
    }
  }

  confirmYahoo(): void {
    const chosen = this.yahooLeagues().find(
      (league) => league.leagueKey === this.chosenYahooLeague(),
    );
    if (chosen) {
      this.chooseYahoo(chosen.leagueKey, chosen.name);
    }
  }

  retry(): void {
    if (this.settingsResource.error()) {
      this.settingsResource.reload();
    }
    if (this.freeAgentsResource.error()) {
      this.freeAgentsResource.reload();
    }
  }

  score(row: RankedFreeAgent): string {
    return row.score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  stat(row: RankedFreeAgent, key: string): string {
    const stats: Record<string, number> = row.player.projection.stats.scoring;
    const value = stats[key];
    if (!Number.isFinite(value)) {
      return '';
    }
    return key === 'svPct' ? value.toFixed(3) : value.toFixed(1);
  }

  /**
   * A one-line projection for the mixed tab, where a column of goals would be empty for every
   * goalie and a column of saves empty for every skater.
   */
  line(row: RankedFreeAgent): string {
    if (row.player.projection.type === 'goalie') {
      return `${this.stat(row, 'w')} W, ${this.stat(row, 'sv')} SV, ${this.stat(row, 'svPct')} SV%`;
    }
    return `${this.stat(row, 'goals')} G, ${this.stat(row, 'assists')} A, ${this.stat(row, 'sog')} SOG`;
  }

  /** The label a status gets in the table. Unknown says nothing rather than guessing. */
  availabilityLabel(player: FreeAgent): string {
    switch (player.availability) {
      case 'WAIVERS':
        return 'Waivers';
      case 'FREE_AGENT':
        return 'Free agent';
      default:
        return '';
    }
  }

  readonly leagueLabel = computed(() => {
    const league: PlannerLeague | null = this.league();
    return league ? league.name : '';
  });

  protected readonly noLeagues = computed(
    () => this.yahooLeaguesResource.hasValue() && this.yahooLeagues().length === 0,
  );

  /** Kept so the template can render nothing while Yahoo is being asked. */
  protected readonly loadingLeagues = computed(() => this.yahooLeaguesResource.isLoading());
}
