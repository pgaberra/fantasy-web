import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { Api } from '../api/api';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { streamerPlannerWeeks } from '../api/fn/streamer-planner/streamer-planner-weeks';
import { PlannerWeek } from '../api/models/planner-week';
import { ScheduledGame } from '../api/models/scheduled-game';
import { TeamSchedule } from '../api/models/team-schedule';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';

export type PlannerPosition = 'skaters' | 'goalies';
export type Tier = 'good' | 'bad' | null;

/** How far an opponent has to sit from the league average before its cell is tinted. */
const MATCHUP_MARGIN = 0.05;
/** The top and bottom this many teams get a tinted rank: roughly a quarter of the league each. */
const RANK_TIER_SIZE = 8;

export interface PlannerDay {
  /** ISO date, e.g. 2026-10-12, as the API sends it. */
  readonly date: string;
  readonly games: number;
  readonly offNight: boolean;
}

/**
 * The streamer planner: every NHL team ranked by how good its schedule is in a week, for picking
 * up a player who will play the most, on the nights a lineup has room, against weak opponents.
 * The rating is projection-service's; this page picks the week and lays the schedule out.
 */
@Component({
  selector: 'app-streamer-planner',
  imports: [ErrorStateComponent, HelpTipComponent, LoadingIndicatorComponent],
  templateUrl: './streamer-planner.html',
  styleUrl: './streamer-planner.css',
})
export class StreamerPlannerComponent {
  private readonly api = inject(Api);

  private readonly weeksResource = rxResource({
    stream: () => from(this.api.invoke(streamerPlannerWeeks)),
  });

  /** The week the user picked, or null for the week the server says today falls in. */
  private readonly chosenWeek = signal<number | null>(null);
  readonly position = signal<PlannerPosition>('skaters');

  readonly weeks = computed<readonly PlannerWeek[]>(() =>
    this.weeksResource.hasValue() ? this.weeksResource.value().weeks : [],
  );

  readonly week = computed<PlannerWeek | undefined>(() => {
    const weeks = this.weeks();
    const wanted = this.chosenWeek() ?? this.weeksResource.value()?.currentWeek;
    return weeks.find((week) => week.week === wanted) ?? weeks[0];
  });

  private readonly teamsResource = rxResource({
    params: () => {
      const week = this.week();
      return week ? { start: week.start, end: week.end } : undefined;
    },
    stream: ({ params }) => from(this.api.invoke(streamerPlannerTeams, params)),
  });

  readonly strength = computed(() =>
    this.teamsResource.hasValue() ? this.teamsResource.value() : undefined,
  );

  /** Every date of the week, in order, including one without a game. */
  readonly days = computed<readonly PlannerDay[]>(() => {
    const strength = this.strength();
    if (!strength) {
      return [];
    }
    const nights = new Map(strength.nights.map((night) => [night.date, night]));
    const days: PlannerDay[] = [];
    for (let day = strength.start; day <= strength.end; day = nextDate(day)) {
      const night = nights.get(day);
      days.push({ date: day, games: night?.games ?? 0, offNight: night?.offNight ?? false });
    }
    return days;
  });

  /** The teams, best first for the chosen position; level teams alphabetically. */
  readonly teams = computed<readonly TeamSchedule[]>(() => {
    const teams = this.strength()?.teams ?? [];
    const rank = this.position() === 'skaters' ? skaterRank : goalieRank;
    return [...teams].sort((a, b) => rank(a) - rank(b) || a.team.localeCompare(b.team));
  });

  readonly offNightMaxGames = computed(() => this.strength()?.offNightMaxGames);
  readonly noSchedule = computed(() => this.weeksResource.hasValue() && this.weeks().length === 0);

  readonly isLoading = computed(
    () => this.weeksResource.isLoading() || this.teamsResource.isLoading(),
  );
  readonly loadFailure = computed(() => this.weeksResource.error() ?? this.teamsResource.error());

  readonly canGoBack = computed(() => {
    const week = this.week();
    return !!week && week.week > this.weeks()[0].week;
  });
  readonly canGoForward = computed(() => {
    const week = this.week();
    const weeks = this.weeks();
    return !!week && week.week < weeks[weeks.length - 1].week;
  });

  selectWeek(event: Event): void {
    const number = Number((event.target as HTMLSelectElement).value);
    if (this.weeks().some((week) => week.week === number)) {
      this.chosenWeek.set(number);
    }
  }

  step(by: number): void {
    const week = this.week();
    const target = week && this.weeks().find((candidate) => candidate.week === week.week + by);
    if (target) {
      this.chosenWeek.set(target.week);
    }
  }

  retry(): void {
    if (this.weeksResource.error()) {
      this.weeksResource.reload();
    }
    if (this.teamsResource.error()) {
      this.teamsResource.reload();
    }
  }

  rank(team: TeamSchedule): number {
    return this.position() === 'skaters' ? team.skaterRank : team.goalieRank;
  }

  score(team: TeamSchedule): number {
    return this.position() === 'skaters' ? team.skaterScore : team.goalieScore;
  }

  rankTier(team: TeamSchedule): Tier {
    const rank = this.rank(team);
    const teams = this.teams().length;
    if (rank <= RANK_TIER_SIZE) {
      return 'good';
    }
    return rank > teams - RANK_TIER_SIZE ? 'bad' : null;
  }

  gameOn(team: TeamSchedule, day: PlannerDay): ScheduledGame | undefined {
    return team.schedule.find((game) => game.date === day.date);
  }

  /** Good for a skater when the opponent concedes more than average; for a goalie, scores less. */
  matchupTier(game: ScheduledGame): Tier {
    const allowed = game.opponentGoalsAgainst - 1;
    const scored = 1 - game.opponentGoalsFor;
    const lean = this.position() === 'skaters' ? allowed : scored;
    if (lean >= MATCHUP_MARGIN) {
      return 'good';
    }
    return lean <= -MATCHUP_MARGIN ? 'bad' : null;
  }

  matchupLabel(game: ScheduledGame): string {
    const where = game.home ? 'vs' : 'at';
    const rate = this.position() === 'skaters' ? game.opponentGoalsAgainst : game.opponentGoalsFor;
    const verb = this.position() === 'skaters' ? 'allows' : 'scores';
    const percent = Math.round(Math.abs(rate - 1) * 100);
    const direction = rate > 1 ? 'more' : 'fewer';
    const opponent = game.opponent ?? 'TBD';
    const sentences = [
      `${where} ${opponent}`,
      percent === 0
        ? `${opponent} ${verb} a league-average number of goals`
        : `${opponent} ${verb} ${percent}% ${direction} goals than average`,
    ];
    if (game.offNight) {
      sentences.push('Off-night');
    }
    if (game.backToBack) {
      sentences.push('Back-to-back');
    }
    return `${sentences.join('. ')}.`;
  }

  weekLabel(week: PlannerWeek): string {
    return `Week ${week.week}: ${formatDay(week.start)} to ${formatDay(week.end)}`;
  }

  dayName(day: PlannerDay): string {
    return parseDate(day.date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  }

  dayOfMonth(day: PlannerDay): string {
    return formatDay(day.date);
  }
}

function skaterRank(team: TeamSchedule): number {
  return team.skaterRank;
}

function goalieRank(team: TeamSchedule): number {
  return team.goalieRank;
}

/** Dates are handled as UTC midnights so no time zone can move a game to another day. */
function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function nextDate(iso: string): string {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
