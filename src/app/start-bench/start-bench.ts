import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { environment } from '../../environments/environment';
import { Api } from '../api/api';
import { startBenchMyTeam } from '../api/fn/start-bench/start-bench-my-team';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../draft-projection/projection-defaults';
import { ScoredProjection } from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { Platform } from '../shared/platform-tabs/platform-tabs';
import { PositionChipsComponent } from '../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../shared/team-logo/team-logo';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { LeagueFieldComponent } from '../streamer-planner/league-field/league-field';
import { teamsByKey, WEEK_DECIMALS } from '../streamer-planner/planner-free-agents';
import { rosterPlayers } from '../streamer-planner/planner-roster';
import {
  addDays,
  clampDate,
  formatDay,
  isIsoDate,
  PLANNER_TODAY,
  weekdayName,
} from '../streamer-planner/planner-schedule';
import {
  byLineupNow,
  gameLabel,
  StartBenchDay,
  StartBenchRow,
  startBenchDay,
} from './start-bench-lineup';

/** How far ahead a day may be picked: a month, the BFF's longest stretch for the schedule. */
export const START_BENCH_DAYS_AHEAD = 30;

/**
 * Start/Bench: the user's lineup for one day and the one the model would set. On a night when
 * most of the league plays a full roster has more players with a game than seats, and someone has
 * to sit; this says who.
 *
 * <p>It opens on today's games, as the NHL counts the night (`PLANNER_TODAY`: a night stays open
 * until its last puck drop, so a reader in Europe after midnight still sees it), and steps a day at
 * a time or jumps to a date. The lineup is the platform's own for that day, read live, so a day
 * ahead shows what the manager has already set for it.
 *
 * <p>The suggestion seats the players whose club plays by the model's line for that day, scored by
 * the league's own settings, best first (`startBenchDay`). The page lists the lineup as it stands
 * and marks the players the suggestion would start or sit; nothing is changed on the platform.
 *
 * <p>The league is picked as the planner and FA Scout pick it, and opens on the league last
 * chosen anywhere ({@link LeagueChoiceService}).
 */
@Component({
  selector: 'app-start-bench',
  imports: [
    ErrorStateComponent,
    HelpTipComponent,
    IconComponent,
    LeagueFieldComponent,
    LoadingIndicatorComponent,
    PositionChipsComponent,
    TeamLogoComponent,
  ],
  templateUrl: './start-bench.html',
  styleUrl: './start-bench.css',
  providers: [YahooLeaguePicker],
})
export class StartBenchComponent {
  private readonly api = inject(Api);
  private readonly picker = inject(YahooLeaguePicker);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);

  constructor() {
    this.picker.start();
  }

  // --- The day --------------------------------------------------------------------------------

  /** Today's games, as the NHL counts the night. */
  readonly today = inject(PLANNER_TODAY)();
  readonly lastDay = addDays(this.today, START_BENCH_DAYS_AHEAD);

  /** The day on screen: today's games until another is picked. */
  readonly date = signal(this.today);

  readonly isToday = computed(() => this.date() === this.today);
  readonly canGoBack = computed(() => this.date() > this.today);
  readonly canGoForward = computed(() => this.date() < this.lastDay);

  /** "Today, Tue Oct 13", "Wed Oct 14". */
  readonly dayLabel = computed(() => {
    const date = this.date();
    const day = `${weekdayName(date)} ${formatDay(date)}`;
    return date === this.today ? `Today, ${day}` : day;
  });

  step(days: number): void {
    this.pickDate(addDays(this.date(), days));
  }

  goToToday(): void {
    this.date.set(this.today);
  }

  /** A date typed or picked, held to today and the month ahead; anything else is ignored. */
  pickDate(value: string): void {
    if (!isIsoDate(value)) {
      return;
    }
    this.date.set(clampDate(value, this.today, this.lastDay));
  }

  // --- The league, picked as the planner picks it ---------------------------------------------

  private readonly espnOffered = environment.espnLeaguesEnabled;
  private readonly remembered = inject(LeagueChoiceService).league();

  readonly platform = signal<Platform>(
    this.espnOffered && this.remembered?.platform === 'ESPN' ? 'espn' : 'yahoo',
  );

  readonly espnLeague = signal<ChosenLeague | null>(
    this.espnOffered && this.remembered?.platform === 'ESPN' ? this.remembered : null,
  );

  readonly league = computed<ChosenLeague | null>(
    () => {
      if (this.platform() === 'espn') {
        return this.espnLeague();
      }
      const key = this.picker.selectedKey();
      return key
        ? { platform: 'YAHOO', leagueId: key, name: this.picker.selectedLeague()?.name ?? key }
        : null;
    },
    { equal: (a, b) => a?.platform === b?.platform && a?.leagueId === b?.leagueId },
  );

  // --- What is read -----------------------------------------------------------------------------

  private readonly teamResource = rxResource({
    params: () => {
      const league = this.league();
      return league ? { league, date: this.date() } : undefined;
    },
    stream: ({ params }) =>
      from(
        this.api.invoke(startBenchMyTeam, {
          platform: params.league.platform,
          leagueId: params.league.leagueId,
          date: params.date,
        }),
      ),
  });

  private readonly settingsResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) =>
      params.platform === 'YAHOO'
        ? this.yahoo.leagueProjectionSettings(params.leagueId)
        : this.espn.leagueProjectionSettings(params.leagueId),
  });

  /** Every club's games that day: who plays, against whom, home or away. */
  private readonly scheduleResource = rxResource({
    params: () => (this.league() ? this.date() : undefined),
    stream: ({ params }) =>
      from(this.api.invoke(streamerPlannerTeams, { start: params, end: params })),
  });

  readonly loading = computed(
    () =>
      this.teamResource.isLoading() ||
      this.settingsResource.isLoading() ||
      this.scheduleResource.isLoading(),
  );

  readonly failure = computed(
    () =>
      this.teamResource.error() ?? this.settingsResource.error() ?? this.scheduleResource.error(),
  );

  retry(): void {
    for (const resource of [this.teamResource, this.settingsResource, this.scheduleResource]) {
      if (resource.error()) {
        resource.reload();
      }
    }
  }

  private readonly team = computed(() =>
    this.teamResource.hasValue() ? this.teamResource.value() : null,
  );

  readonly teamName = computed(() => this.team()?.teamName ?? null);

  /** A league the user only follows, or an ESPN league read without his cookies. */
  readonly notFound = computed(() => this.team()?.found === false);

  readonly emptyRoster = computed(() => {
    const team = this.team();
    return !!team?.found && team.players.length === 0;
  });

  /** The league's own scoring, or the app's defaults until its settings land. */
  private readonly scoring = computed(() => {
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    return {
      scoringType: settings?.scoringType ?? 'points',
      statWeights: {
        ...DEFAULT_STAT_WEIGHTS,
        ...((settings?.statWeights ?? {}) as Record<ScoringStatKey, number>),
      },
      activeScoringColumns: new Set(
        (settings?.activeScoringColumns as ScoringStatKey[] | undefined) ?? DEFAULT_SCORING_COLUMNS,
      ),
    };
  });

  readonly scoringType = computed(() => this.scoring().scoringType);

  /**
   * Each player's line for the day scored by the league's settings, among the user's own players:
   * fantasy points in a points league, a z-score measured from an empty night in a category one,
   * so a player with no game scores nought rather than below the average.
   */
  private readonly scores = computed<ReadonlyMap<string, number>>(() => {
    const team = this.team();
    if (!team?.found) {
      return new Map();
    }
    const players = rosterPlayers(team);
    if (players.length === 0) {
      return new Map();
    }
    const scoring = this.scoring();
    const scored = new Map<number, number>();
    for (const entry of this.ranking.rankOverall({
      projections: players.map((player) => player.projection),
      scoringType: scoring.scoringType,
      statWeights: scoring.statWeights,
      activeScoringColumns: scoring.activeScoringColumns,
      leagueSize: DEFAULT_LEAGUE_SIZE,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      // One night is one game at most: the season minimum would rank every goalie out.
      minGoalieGames: 0,
      decimalSettings: WEEK_DECIMALS,
      zScoreOrigin: 'empty',
    })) {
      scored.set(entry.projection.playerId, this.scoreOf(entry));
    }
    return new Map(
      players.map((player) => [player.playerId, scored.get(player.projection.playerId) ?? 0]),
    );
  });

  private scoreOf(entry: ScoredProjection): number {
    return this.scoringType() === 'points' ? entry.score.fantasyPoints : entry.score.zScore;
  }

  /** The day's lineup, now and as suggested; null until everything it needs has landed. */
  readonly day = computed<StartBenchDay | null>(() => {
    const team = this.team();
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    const schedule = this.scheduleResource.hasValue() ? this.scheduleResource.value() : null;
    if (!team?.found || !schedule) {
      return null;
    }
    const expected = new Map(team.lines.map((line) => [line.playerId, line.expectedGames]));
    return startBenchDay(
      team.players,
      settings?.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
      teamsByKey(schedule.teams),
      this.date(),
      this.scores(),
      expected,
    );
  });

  /** The rows as the lineup reads now: the players starting, slot by slot, then bench, then IR. */
  readonly rows = computed<readonly StartBenchRow[]>(() => byLineupNow(this.day()?.rows ?? []));

  /** No club of the user's plays that day. */
  readonly nobodyPlays = computed(() => this.day()?.playing === 0);

  readonly changes = computed(() => {
    const day = this.day();
    return day ? day.starts.length + day.benches.length : 0;
  });

  /** "Start Kakko and Blake." "Sit Hedman." */
  namesText(rows: readonly StartBenchRow[]): string {
    const names = rows.map((row) => row.player.name);
    return names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  /** "+3.4 projected points", only in a points league, where a difference has a unit. */
  readonly gainText = computed(() => {
    const gain = this.day()?.gain;
    if (this.scoringType() !== 'points' || gain === null || gain === undefined || gain <= 0) {
      return null;
    }
    return `+${gain.toFixed(1)} projected fantasy points`;
  });

  gameText(row: StartBenchRow): string {
    return row.game ? gameLabel(row.game) : 'No game';
  }

  /** A goalie's chance to start, the one thing that decides whether his night counts. */
  startChance(row: StartBenchRow): string | null {
    if (row.player.type !== 'goalie' || !row.game || row.expectedGames === null) {
      return null;
    }
    return `${Math.round(Math.min(1, row.expectedGames) * 100)}% to start`;
  }

  formatScore(score: number | null): string {
    if (score === null) {
      return '–';
    }
    return score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  /** The slot as the platform names it, the bench as "Bench". */
  slotText(slot: string | null): string {
    if (!slot || ['BN', 'BE', 'BENCH'].includes(slot.toUpperCase())) {
      return 'Bench';
    }
    return slot;
  }

  /** Why a player who sits in the suggestion sits: he has no game, is out, or is beaten to the seat. */
  sitReason(row: StartBenchRow): string {
    if (row.now === 'reserve') {
      return row.nowSlot ?? 'IR';
    }
    if (row.player.out) {
      return 'Out';
    }
    if (!row.game) {
      return 'No game';
    }
    return 'Bench';
  }
}
