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
import { TeamLogoComponent } from '../shared/team-logo/team-logo';
import { FreeAgentsTableComponent } from './free-agents-table/free-agents-table';
import { LeagueFieldComponent } from './league-field/league-field';
import {
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
  clampStretch,
  dayName,
  earliestStart,
  formatDay,
  isIsoDate,
  latestEnd,
  leadingDays,
  PLANNER_PRESETS,
  PLANNER_TODAY,
  PlannerDay,
  plannerDays,
  PlannerPosition,
  PlannerPreset,
  presetStretch,
  rateTeams,
  sameStretch,
  Stretch,
  stretchLabel,
  weekdayName,
  weeksTitle,
} from './planner-schedule';
import { TeamSchedulesComponent } from './team-schedules/team-schedules';

export type { Stretch } from './planner-schedule';

/** A preset with the stretch it names today, for the reader to pick by name. */
export interface PresetOption {
  readonly key: PlannerPreset;
  readonly label: string;
  readonly stretch: Stretch;
}

/**
 * The streamer planner: every NHL team ranked by how good its schedule is over the nights ahead,
 * and the best players a league has available for them.
 *
 * <p>The nights are the page's one setting. They are picked by name (the rest of this week, next
 * week, both) or by two dates, and any night among them can be left out; the teams and the free
 * agents follow at once, with no button, as on Team Power Rankings. A night already played is not
 * offered: a stretch starts no earlier than today. The controls that only concern one table sit on
 * that table (skaters or goalies on the team schedules, how many a position on the free agents),
 * and the league, which the free agents are read from, sits beside the nights.
 *
 * <p>The server rates the whole stretch; a night the reader leaves out is taken out here, by the
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
    TeamLogoComponent,
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
  /** Read once, when the page opens: the nights are counted from this day. */
  private readonly today = inject(PLANNER_TODAY)();

  // --- The nights -------------------------------------------------------------------------------

  private readonly weeksResource = rxResource({
    stream: () => from(this.api.invoke(streamerPlannerWeeks)),
  });

  readonly weeks = computed<readonly PlannerWeek[]>(() =>
    this.weeksResource.hasValue() ? this.weeksResource.value().weeks : [],
  );

  /** The stretch the reader asked for, or null for the rest of this week. */
  private readonly chosen = signal<Stretch | null>(null);

  readonly stretch = computed<Stretch | undefined>(() => {
    const weeks = this.weeks();
    const wanted = this.chosen() ?? presetStretch('this-week', weeks, this.today);
    return wanted ? clampStretch(wanted, weeks, this.today) : undefined;
  });

  /** The presets the season still has a stretch for. */
  readonly presets = computed<readonly PresetOption[]>(() =>
    PLANNER_PRESETS.flatMap((preset) => {
      const stretch = presetStretch(preset.key, this.weeks(), this.today);
      return stretch ? [{ ...preset, stretch }] : [];
    }),
  );

  /** The preset the stretch on screen is, if it is one. */
  readonly activePreset = computed<PlannerPreset | null>(
    () => this.presets().find((preset) => sameStretch(preset.stretch, this.stretch()))?.key ?? null,
  );

  readonly earliestStart = computed(() => earliestStart(this.weeks(), this.today));
  readonly latestEnd = computed(() => latestEnd(this.weeks(), this.stretch()?.start ?? this.today));
  readonly seasonEnd = computed(() => this.weeks()[this.weeks().length - 1]?.end ?? '');

  applyPreset(key: PlannerPreset): void {
    const preset = this.presets().find((candidate) => candidate.key === key);
    if (preset) {
      this.chosen.set(preset.stretch);
    }
  }

  /** The first night, typed or picked; the last follows it if it has to. */
  setStart(event: Event): void {
    const input = event.target as HTMLInputElement;
    const stretch = this.stretch();
    if (isIsoDate(input.value) && stretch) {
      this.chosen.set({ start: input.value, end: stretch.end });
    }
    // Written back, since a clamped date leaves the box showing what was typed.
    input.value = this.stretch()?.start ?? '';
  }

  setEnd(event: Event): void {
    const input = event.target as HTMLInputElement;
    const stretch = this.stretch();
    if (isIsoDate(input.value) && stretch) {
      this.chosen.set({ start: stretch.start, end: input.value });
    }
    input.value = this.stretch()?.end ?? '';
  }

  // --- The teams and the nights -----------------------------------------------------------------

  private readonly teamsResource = rxResource({
    params: () => this.stretch(),
    stream: ({ params }) => from(this.api.invoke(streamerPlannerTeams, params)),
  });

  readonly strength = computed(() =>
    this.teamsResource.hasValue() ? this.teamsResource.value() : undefined,
  );

  /** Every date of the stretch, in order, including one without a game. */
  readonly days = computed<readonly PlannerDay[]>(() => {
    const strength = this.strength();
    return strength ? plannerDays(strength) : [];
  });

  /** The nights the reader has left out. A new stretch starts with every night counted. */
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

  readonly position = signal<PlannerPosition>('skaters');

  setPosition(position: PlannerPosition): void {
    this.position.set(position);
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

  readonly perPosition = signal<FreeAgentsPerPosition>(3);
  readonly perPositionOptions = FREE_AGENTS_PER_POSITION;

  setPerPosition(option: FreeAgentsPerPosition): void {
    this.perPosition.set(option);
  }

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

  /** The cards have something to show, or will once the list lands. */
  readonly showsTopOptions = computed(
    () => !!this.league() && (this.loadingFreeAgents() || this.topOptions().length > 0),
  );

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
    const stretch = this.stretch();
    return stretch ? weeksTitle(this.weeks(), stretch) : '';
  });

  /** "Oct 19 to Oct 25". */
  readonly stretchTitle = computed(() => {
    const stretch = this.stretch();
    return stretch ? stretchLabel(stretch.start, stretch.end) : '';
  });

  /** "6 of 7 nights": the nights counted, of the nights with games. */
  readonly nightsTitle = computed(() => {
    const nights = this.nightsWithGames();
    return nights === 0 ? 'No games' : `${this.counted().size} of ${nights} nights`;
  });

  /** What a night is worth, said once, in the tip beside the nights. */
  readonly nightsHelp = computed(() => {
    const max = this.offNightMaxGames();
    const offNight = max
      ? `An off-night has ${max} games or fewer, when most lineups have an open slot, so a game on one counts 1.25.`
      : 'A game on an off-night, when most lineups have an open slot, counts 1.25.';
    return `${offNight} Untick a night your lineup has no room on.`;
  });

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  dayName(day: PlannerDay): string {
    return dayName(day);
  }

  dayOfMonth(day: PlannerDay): string {
    return formatDay(day.date);
  }

  /** The days of the week already behind the stretch, drawn faint so its first row reads as a week. */
  readonly leadingDays = computed<readonly string[]>(() => {
    const start = this.stretch()?.start;
    return start && this.days().length > 0 ? leadingDays(start) : [];
  });

  weekdayName(date: string): string {
    return weekdayName(date);
  }

  formatDay(date: string): string {
    return formatDay(date);
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

  /** The score a game he plays, the way a streamer compares a three-game week to a four. */
  perGameText(row: RankedFreeAgent): string {
    if (row.games <= 0) {
      return '';
    }
    return (row.score / row.games).toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  games(row: RankedFreeAgent): string {
    return formatGames(row.games);
  }

  /** A claim rather than an add: the one status a streamer has to know before acting. */
  onWaivers(row: RankedFreeAgent): boolean {
    return row.player.availability === 'WAIVERS';
  }

  /** "EDM, C" under a card's name. */
  identity(row: RankedFreeAgent): string {
    const positions = row.player.positions.join(', ');
    return row.player.teamAbbrev ? `${row.player.teamAbbrev}, ${positions}` : positions;
  }
}
