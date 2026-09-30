import { PlannerWeek } from '../api/models/planner-week';
import { ScheduledGame } from '../api/models/scheduled-game';
import { ScheduleStrengthResponse } from '../api/models/schedule-strength-response';
import { TeamSchedule } from '../api/models/team-schedule';

export type PlannerPosition = 'skaters' | 'goalies';
export type Tier = 'good' | 'bad' | null;

/**
 * What a game on an off-night is worth over a game on any other night. The same constant as
 * projection-service's `schedule_strength.OFF_NIGHT_BONUS`: the server rates the whole stretch,
 * and this is what lets the page rate the nights the reader keeps, by the same rule.
 */
export const OFF_NIGHT_BONUS = 0.25;
/** How far an opponent has to sit from the league average before its game is tinted. */
export const MATCHUP_MARGIN = 0.05;
/** The top and bottom this many teams get a tinted rank: roughly a quarter of the league each. */
export const RANK_TIER_SIZE = 8;
/** The longest stretch the BFF rates; the teams and the free agents both refuse a longer one. */
export const MAX_STRETCH_DAYS = 31;

export interface PlannerDay {
  /** ISO date, e.g. 2026-10-12, as the API sends it. */
  readonly date: string;
  readonly games: number;
  readonly offNight: boolean;
}

/** A team's schedule over the nights counted, rated for one kind of player. */
export interface PlannerTeamRow {
  readonly team: string;
  readonly games: number;
  readonly homeGames: number;
  readonly awayGames: number;
  readonly offNightGames: number;
  readonly backToBacks: number;
  /** Games against an opponent the tint calls good, and bad, for the chosen position. */
  readonly favourable: number;
  readonly unfavourable: number;
  readonly score: number;
  /** 1 is the best; level teams share a rank and the next one skips, as the server ranks. */
  readonly rank: number;
  /** The games on the nights counted, in date order. */
  readonly schedule: readonly ScheduledGame[];
}

/** Every date of the stretch, in order, including one without a game. */
export function plannerDays(strength: ScheduleStrengthResponse): PlannerDay[] {
  const nights = new Map(strength.nights.map((night) => [night.date, night]));
  const days: PlannerDay[] = [];
  for (let day = strength.start; day <= strength.end; day = nextDate(day)) {
    const night = nights.get(day);
    days.push({ date: day, games: night?.games ?? 0, offNight: night?.offNight ?? false });
  }
  return days;
}

/**
 * Every team rated over the nights counted, best first.
 *
 * <p>With every night counted the server's own score and rank are used as they came: the server is
 * the authority on the rating, and this page only re-derives it where the reader has left a night
 * out, by the same rule (a game is worth 1, or 1.25 on an off-night, scaled by the goals the
 * opponent concedes for a skater and by the inverse of the goals it scores for a goalie).
 */
export function rateTeams(
  teams: readonly TeamSchedule[],
  position: PlannerPosition,
  counted: ReadonlySet<string>,
  everyNightCounted: boolean,
): PlannerTeamRow[] {
  const rated = teams.map((team): PlannerTeamRow => {
    const schedule = everyNightCounted
      ? team.schedule
      : team.schedule.filter((game) => counted.has(game.date));
    const homeGames = schedule.filter((game) => game.home).length;
    return {
      team: team.team,
      games: schedule.length,
      homeGames,
      awayGames: schedule.length - homeGames,
      offNightGames: schedule.filter((game) => game.offNight).length,
      backToBacks: schedule.filter((game) => game.backToBack).length,
      favourable: schedule.filter((game) => matchupTier(game, position) === 'good').length,
      unfavourable: schedule.filter((game) => matchupTier(game, position) === 'bad').length,
      score: everyNightCounted
        ? serverScore(team, position)
        : round2(schedule.reduce((sum, game) => sum + gameWorth(game, position), 0)),
      rank: everyNightCounted ? serverRank(team, position) : 0,
      schedule,
    };
  });
  const rows = everyNightCounted ? rated : competitionRanked(rated);
  return [...rows].sort((a, b) => a.rank - b.rank || a.team.localeCompare(b.team));
}

function serverScore(team: TeamSchedule, position: PlannerPosition): number {
  return position === 'skaters' ? team.skaterScore : team.goalieScore;
}

function serverRank(team: TeamSchedule, position: PlannerPosition): number {
  return position === 'skaters' ? team.skaterRank : team.goalieRank;
}

function gameWorth(game: ScheduledGame, position: PlannerPosition): number {
  const worth = 1 + (game.offNight ? OFF_NIGHT_BONUS : 0);
  return position === 'skaters' ? worth * game.opponentGoalsAgainst : worth / game.opponentGoalsFor;
}

/** Standard competition ranking: two teams level share a rank and the next one skips. */
function competitionRanked(rows: readonly PlannerTeamRow[]): PlannerTeamRow[] {
  const ordered = [...rows].sort((a, b) => b.score - a.score);
  let rank = 0;
  let last: number | null = null;
  return ordered.map((row, index) => {
    if (row.score !== last) {
      rank = index + 1;
      last = row.score;
    }
    return { ...row, rank };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function rankTier(rank: number, teams: number): Tier {
  if (rank <= RANK_TIER_SIZE) {
    return 'good';
  }
  return rank > teams - RANK_TIER_SIZE ? 'bad' : null;
}

/** Good for a skater when the opponent concedes more than average; for a goalie, scores less. */
export function matchupTier(game: ScheduledGame, position: PlannerPosition): Tier {
  const allowed = game.opponentGoalsAgainst - 1;
  const scored = 1 - game.opponentGoalsFor;
  const lean = position === 'skaters' ? allowed : scored;
  if (lean >= MATCHUP_MARGIN) {
    return 'good';
  }
  return lean <= -MATCHUP_MARGIN ? 'bad' : null;
}

export function matchupLabel(game: ScheduledGame, position: PlannerPosition): string {
  const where = game.home ? 'vs' : 'at';
  const rate = position === 'skaters' ? game.opponentGoalsAgainst : game.opponentGoalsFor;
  const verb = position === 'skaters' ? 'allows' : 'scores';
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

/** The weeks an interval may end on, given where it starts: that week or a later one, within the longest stretch. */
export function endWeekOptions(weeks: readonly PlannerWeek[], start: PlannerWeek): PlannerWeek[] {
  return weeks.filter(
    (week) => week.week >= start.week && daysBetween(start.start, week.end) <= MAX_STRETCH_DAYS,
  );
}

/** Days from one date to another, both included. */
export function daysBetween(start: string, end: string): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / millisPerDay) + 1;
}

export function weekLabel(week: PlannerWeek): string {
  return `Week ${week.week} (${formatDay(week.start)} to ${formatDay(week.end)})`;
}

/** "Week 3", or "Weeks 3 to 5" for an interval. */
export function weeksLabel(start: PlannerWeek, end: PlannerWeek): string {
  return start.week === end.week ? `Week ${start.week}` : `Weeks ${start.week} to ${end.week}`;
}

/** "Oct 19 to Oct 25". */
export function stretchLabel(start: string, end: string): string {
  return `${formatDay(start)} to ${formatDay(end)}`;
}

export function dayName(day: PlannerDay): string {
  return parseDate(day.date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function formatDay(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Dates are handled as UTC midnights so no time zone can move a game to another day. */
export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function nextDate(iso: string): string {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
