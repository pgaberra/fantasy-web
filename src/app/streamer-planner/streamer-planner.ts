import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { Api } from '../api/api';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { streamerPlannerWeeks } from '../api/fn/streamer-planner/streamer-planner-weeks';
import { PlannerWeek } from '../api/models/planner-week';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../draft-projection/projection-defaults';
import { ScoringStatKey } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { StreamerPlannerFreeAgentsService } from '../services/streamer-planner-free-agents.service';
import { StreamerPlannerLeagueService } from '../services/streamer-planner-league.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { FreeAgentsTableComponent } from './free-agents-table/free-agents-table';
import { LeagueFieldComponent } from './league-field/league-field';
import {
  availabilityLabel,
  FREE_AGENTS_PER_POSITION,
  FreeAgentsPerPosition,
  formatGames,
  groupByPosition,
  nightsFactor,
  RankedFreeAgent,
  scaledProjection,
  teamsByKey,
  TOP_OPTIONS,
  WEEK_DECIMALS,
} from './planner-free-agents';
import {
  dayName,
  endWeekOptions,
  formatDay,
  PlannerDay,
  plannerDays,
  PlannerPosition,
  rateTeams,
  stretchLabel,
  weekLabel,
  weeksLabel,
} from './planner-schedule';
import { TeamSchedulesComponent } from './team-schedules/team-schedules';

/** The dates a report covers, both included. */
export interface Stretch {
  readonly start: string;
  readonly end: string;
}

/**
 * The streamer planner: every NHL team ranked by how good its schedule is over an interval of
 * weeks, and the best players a league has available for it.
 *
 * <p>The page is laid out the way LineupExperts lays out its streaming planner (Alexander's call,
 * 2026-09-30): the report's settings in one bar, the interval's nights in a strip, the three best
 * pickups as cards, and the team schedules beside the free agents by position. Two things differ
 * on purpose. There is no "Run report" button: nothing here is saved or sent anywhere but to be
 * read, so what the settings point at is what is on screen, as on Team Power Rankings. And the
 * nights have no "Apply" either: unticking one re-rates the teams at once.
 *
 * <p>The server rates the whole interval; a night the reader leaves out is taken out here, by the
 * server's own rule (`planner-schedule.ts`), and a free agent's line is scaled to the share of
 * his club's games that fall on the nights kept (`planner-free-agents.ts`). The ranking of the
 * free agents happens here too, by the league's own scoring settings through the same engine a
 * projection uses, because "best" only means anything against what the league pays for.
 */
@Component({
  selector: 'app-streamer-planner',
  imports: [
    ErrorStateComponent,
    FreeAgentsTableComponent,
    HelpTipComponent,
    IconComponent,
    LeagueFieldComponent,
    LoadingIndicatorComponent,
    PlayerHeadshotComponent,
    TeamSchedulesComponent,
  ],
  templateUrl: './streamer-planner.html',
  styleUrl: './streamer-planner.css',
})
export class StreamerPlannerComponent {
  private readonly api = inject(Api);
  private readonly freeAgentsService = inject(StreamerPlannerFreeAgentsService);
  private readonly leagueService = inject(StreamerPlannerLeagueService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);

  // --- The interval -----------------------------------------------------------------------------

  private readonly weeksResource = rxResource({
    stream: () => from(this.api.invoke(streamerPlannerWeeks)),
  });

  readonly weeks = computed<readonly PlannerWeek[]>(() =>
    this.weeksResource.hasValue() ? this.weeksResource.value().weeks : [],
  );

  /** The weeks the reader picked, or null for the week the server says today falls in. */
  private readonly chosenStart = signal<number | null>(null);
  private readonly chosenEnd = signal<number | null>(null);

  readonly startWeek = computed<PlannerWeek | undefined>(() => {
    const weeks = this.weeks();
    const wanted = this.chosenStart() ?? this.weeksResource.value()?.currentWeek;
    return weeks.find((week) => week.week === wanted) ?? weeks[0];
  });

  /** The weeks the interval may end on: the starting week or a later one the server still rates. */
  readonly endOptions = computed<readonly PlannerWeek[]>(() => {
    const start = this.startWeek();
    return start ? endWeekOptions(this.weeks(), start) : [];
  });

  /** The chosen ending week while it is still on offer; the starting week once it is not. */
  readonly endWeek = computed<PlannerWeek | undefined>(() => {
    const start = this.startWeek();
    if (!start) {
      return undefined;
    }
    return this.endOptions().find((week) => week.week === this.chosenEnd()) ?? start;
  });

  readonly stretch = computed<Stretch | undefined>(() => {
    const start = this.startWeek();
    const end = this.endWeek();
    return start && end ? { start: start.start, end: end.end } : undefined;
  });

  readonly position = signal<PlannerPosition>('skaters');
  readonly perPosition = signal<FreeAgentsPerPosition>(3);
  readonly perPositionOptions = FREE_AGENTS_PER_POSITION;

  selectStartWeek(event: Event): void {
    const number = Number((event.target as HTMLSelectElement).value);
    if (this.weeks().some((week) => week.week === number)) {
      this.chosenStart.set(number);
    }
  }

  selectEndWeek(event: Event): void {
    const number = Number((event.target as HTMLSelectElement).value);
    if (this.endOptions().some((week) => week.week === number)) {
      this.chosenEnd.set(number);
    }
  }

  selectPosition(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.position.set(value === 'goalies' ? 'goalies' : 'skaters');
  }

  selectPerPosition(event: Event): void {
    const number = Number((event.target as HTMLSelectElement).value);
    const option = FREE_AGENTS_PER_POSITION.find((candidate) => candidate === number);
    if (option) {
      this.perPosition.set(option);
    }
  }

  // --- The teams and the nights -----------------------------------------------------------------

  private readonly teamsResource = rxResource({
    params: () => this.stretch(),
    stream: ({ params }) => from(this.api.invoke(streamerPlannerTeams, params)),
  });

  readonly strength = computed(() =>
    this.teamsResource.hasValue() ? this.teamsResource.value() : undefined,
  );

  /** Every date of the interval, in order, including one without a game. */
  readonly days = computed<readonly PlannerDay[]>(() => {
    const strength = this.strength();
    return strength ? plannerDays(strength) : [];
  });

  /** The nights the reader has left out. A new interval starts with every night counted. */
  private readonly excluded = linkedSignal<Stretch | undefined, ReadonlySet<string>>({
    source: this.stretch,
    computation: () => new Set<string>(),
  });

  /** The nights with games that are counted. */
  readonly counted = computed<ReadonlySet<string>>(() => {
    const excluded = this.excluded();
    return new Set(
      this.days()
        .filter((day) => day.games > 0 && !excluded.has(day.date))
        .map((day) => day.date),
    );
  });

  readonly everyNightCounted = computed(() => this.excluded().size === 0);

  readonly nightsWithGames = computed(() => this.days().filter((day) => day.games > 0).length);

  isCounted(day: PlannerDay): boolean {
    return !this.excluded().has(day.date);
  }

  toggleDay(day: PlannerDay): void {
    this.excluded.update((excluded) => {
      const next = new Set(excluded);
      if (next.has(day.date)) {
        next.delete(day.date);
      } else {
        next.add(day.date);
      }
      return next;
    });
  }

  /** The teams over the nights counted, best first for the chosen kind of player. */
  readonly teamRows = computed(() =>
    rateTeams(
      this.strength()?.teams ?? [],
      this.position(),
      this.counted(),
      this.everyNightCounted(),
    ),
  );

  readonly offNightMaxGames = computed(() => this.strength()?.offNightMaxGames);
  readonly noSchedule = computed(() => this.weeksResource.hasValue() && this.weeks().length === 0);

  readonly loadingSchedule = computed(
    () => this.weeksResource.isLoading() || this.teamsResource.isLoading(),
  );
  readonly loadFailure = computed(() => this.weeksResource.error() ?? this.teamsResource.error());

  retry(): void {
    if (this.weeksResource.error()) {
      this.weeksResource.reload();
    }
    if (this.teamsResource.error()) {
      this.teamsResource.reload();
    }
  }

  // --- The league and its free agents -----------------------------------------------------------

  readonly league = this.leagueService.league;

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
      const stretch = this.stretch();
      return league && stretch ? { league, ...stretch } : undefined;
    },
    stream: ({ params }) =>
      this.freeAgentsService.freeAgents(
        params.league.platform,
        params.league.leagueId,
        params.start,
        params.end,
      ),
  });

  readonly loadingFreeAgents = computed(
    () => this.freeAgentsResource.isLoading() || this.settingsResource.isLoading(),
  );
  readonly freeAgentsFailure = computed(
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

  private readonly teamsByKey = computed(() => teamsByKey(this.strength()?.teams ?? []));

  /** Every available player with a projection, best first by the league's scoring. */
  readonly ranked = computed<RankedFreeAgent[]>(() => {
    const week = this.freeAgentsResource.hasValue() ? this.freeAgentsResource.value() : null;
    if (!week) {
      return [];
    }
    const scoring = this.scoring();
    const teams = this.teamsByKey();
    const counted = this.counted();
    const everyNightCounted = this.everyNightCounted();
    const factors = new Map<string, number>();
    const byPlayerId = new Map(week.players.map((player) => [player.projection.playerId, player]));
    const projections = week.players.map((player) => {
      const factor = nightsFactor(player, teams, counted, everyNightCounted);
      factors.set(player.playerId, factor);
      return scaledProjection(player.projection, factor);
    });
    const scored = this.ranking.rankOverall({
      projections,
      scoringType: scoring.scoringType,
      statWeights: scoring.statWeights,
      activeScoringColumns: scoring.activeScoringColumns,
      leagueSize: DEFAULT_LEAGUE_SIZE,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      // A goalie streamed for a week has nothing like a season's starts behind him, and the
      // minimum is there to keep a backup off a season table. Applied here it would disqualify
      // every goalie on the page.
      minGoalieGames: 0,
      decimalSettings: WEEK_DECIMALS,
    });
    const ranked: RankedFreeAgent[] = [];
    for (const [index, entry] of scored.entries()) {
      const player = byPlayerId.get(entry.projection.playerId);
      if (player) {
        const factor = factors.get(player.playerId) ?? 1;
        ranked.push({
          player,
          score: scoring.scoringType === 'points' ? entry.score.fantasyPoints : entry.score.zScore,
          rank: index + 1,
          games: player.expectedGames * factor,
        });
      }
    }
    return ranked;
  });

  readonly topOptions = computed(() => this.ranked().slice(0, TOP_OPTIONS));
  readonly groups = computed(() => groupByPosition(this.ranked(), this.perPosition()));

  readonly noFreeAgents = computed(
    () =>
      !!this.league() &&
      !this.loadingFreeAgents() &&
      !this.freeAgentsFailure() &&
      this.ranked().length === 0,
  );

  retryFreeAgents(): void {
    if (this.settingsResource.error()) {
      this.settingsResource.reload();
    }
    if (this.freeAgentsResource.error()) {
      this.freeAgentsResource.reload();
    }
  }

  // --- Words for the page -----------------------------------------------------------------------

  /** "Week 3", or "Weeks 3 to 5". */
  readonly weeksTitle = computed(() => {
    const start = this.startWeek();
    const end = this.endWeek();
    return start && end ? weeksLabel(start, end) : '';
  });

  /** "Oct 19 to Oct 25". */
  readonly stretchTitle = computed(() => {
    const stretch = this.stretch();
    return stretch ? stretchLabel(stretch.start, stretch.end) : '';
  });

  /** "6 of 7": the nights counted, of the nights with games. */
  readonly nightsTitle = computed(() => `${this.counted().size} of ${this.nightsWithGames()}`);

  readonly leagueTitle = computed(() => this.league()?.name ?? 'Not chosen');

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  readonly freeAgentsLede = computed(() => {
    const league = this.league();
    return league
      ? `The best available in ${league.name} by position, scored by its own settings.`
      : "The best available players by position, scored by your league's settings.";
  });

  weekLabel(week: PlannerWeek): string {
    return weekLabel(week);
  }

  dayName(day: PlannerDay): string {
    return dayName(day);
  }

  dayOfMonth(day: PlannerDay): string {
    return formatDay(day.date);
  }

  gamesLabel(day: PlannerDay): string {
    if (day.games === 0) {
      return 'No games';
    }
    return day.games === 1 ? '1 game' : `${day.games} games`;
  }

  scoreText(row: RankedFreeAgent): string {
    return row.score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  games(row: RankedFreeAgent): string {
    return formatGames(row.games);
  }

  availability(row: RankedFreeAgent): string {
    return availabilityLabel(row.player.availability);
  }

  /** "EDM, C" under a card's name. */
  identity(row: RankedFreeAgent): string {
    const positions = row.player.positions.join(', ');
    return row.player.teamAbbrev ? `${row.player.teamAbbrev}, ${positions}` : positions;
  }
}
