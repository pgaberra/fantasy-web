import { InjectionToken } from '@angular/core';
import { PlannerWeek } from '../api/models/planner-week';
import { ScheduledGame } from '../api/models/scheduled-game';
import { ScheduleStrengthResponse } from '../api/models/schedule-strength-response';
import { TeamSchedule } from '../api/models/team-schedule';

export type Tier = 'good' | 'bad' | null;

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

/** A team's schedule over the nights counted. */
export interface PlannerTeamRow {
  readonly team: string;
  readonly games: number;
  readonly homeGames: number;
  readonly awayGames: number;
  readonly offNightGames: number;
  readonly backToBacks: number;
  /** Games against an opponent the tint calls good, and bad. */
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
 * <p>One rating serves the whole page, whichever kind of player the free agents beside it list: the
 * server's skater rating, where an opponent that concedes more makes a better game. The server
 * rates goalies too, by the goals an opponent scores, but a table that re-ranked when the list
 * beside it turned to goalies read as two answers to one question.
 *
 * <p>With every night counted the server's own score and rank are used as they came: the server is
 * the authority on the rating. Where the reader has left a night out, the page sums the worth the
 * server put on each game it keeps, so the rule (the night, the opponent and the venue) lives on
 * the server alone.
 */
export function rateTeams(
  teams: readonly TeamSchedule[],
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
      favourable: schedule.filter((game) => matchupTier(game) === 'good').length,
      unfavourable: schedule.filter((game) => matchupTier(game) === 'bad').length,
      score: everyNightCounted
        ? team.skaterScore
        : round2(schedule.reduce((sum, game) => sum + game.skaterWorth, 0)),
      rank: everyNightCounted ? team.skaterRank : 0,
      schedule,
    };
  });
  const rows = everyNightCounted ? rated : competitionRanked(rated);
  return [...rows].sort((a, b) => a.rank - b.rank || a.team.localeCompare(b.team));
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

/** Good when the opponent concedes more goals than average, bad when it concedes fewer. */
export function matchupTier(game: ScheduledGame): Tier {
  const lean = game.opponentGoalsAgainst - 1;
  if (lean >= MATCHUP_MARGIN) {
    return 'good';
  }
  return lean <= -MATCHUP_MARGIN ? 'bad' : null;
}

export function matchupLabel(game: ScheduledGame): string {
  const where = game.home ? 'vs' : 'at';
  const rate = game.opponentGoalsAgainst;
  const percent = Math.round(Math.abs(rate - 1) * 100);
  const direction = rate > 1 ? 'more' : 'fewer';
  const opponent = game.opponent ?? 'TBD';
  const sentences = [
    `${where} ${opponent}`,
    percent === 0
      ? `${opponent} allows a league-average number of goals`
      : `${opponent} allows ${percent}% ${direction} goals than average`,
  ];
  if (game.offNight) {
    sentences.push('Off-night');
  }
  if (game.backToBack) {
    sentences.push('Back-to-back');
  }
  return `${sentences.join('. ')}.`;
}

/** The dates a report covers, both included. */
export interface Stretch {
  readonly start: string;
  readonly end: string;
}

/** The stretches a reader picks by name. */
export type PlannerPreset = 'this-week' | 'next-week' | 'two-weeks';

export const PLANNER_PRESETS: readonly { readonly key: PlannerPreset; readonly label: string }[] = [
  { key: 'this-week', label: 'This week' },
  { key: 'next-week', label: 'Next week' },
  { key: 'two-weeks', label: 'Two weeks' },
];

/**
 * Today as the NHL counts nights, as the API spells a date. A night is dated where it is played, in
 * North America, so a reader in Europe is a calendar day ahead while that night's games are still to
 * come: at 00:30 in Stockholm Thursday's games have not started. A night therefore stays open until
 * 01:00 Eastern the next morning (07:00 in Stockholm). Its games may still be running then, but the
 * latest puck drop, 22:30 Eastern, is long past, and a lineup locks at puck drop: a
 * night no one can stream for any more is not a night to plan.
 */
export const PLANNER_TODAY = new InjectionToken<() => string>('PLANNER_TODAY', {
  providedIn: 'root',
  factory: () => () => hockeyNight(),
});

/** The hour, Eastern time, by which the night before has started everywhere it is played. */
const NIGHT_ENDS_AT_HOUR = 1;

const EASTERN_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hockeyNight(now: Date = new Date()): string {
  const parts = EASTERN_DATE.formatToParts(
    new Date(now.getTime() - NIGHT_ENDS_AT_HOUR * 3_600_000),
  );
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The week today falls in: the first before opening night, the last after the season. */
export function weekOf(weeks: readonly PlannerWeek[], today: string): PlannerWeek | undefined {
  return weeks.find((week) => today <= week.end) ?? weeks[weeks.length - 1];
}

/**
 * The stretch a preset names, from today: the rest of this week, the whole of next week, or both
 * together. A night already played is not a night to stream for, so this week starts today rather
 * than on Monday; before opening night it starts on opening night. Nothing where the season has no
 * next week to offer.
 */
export function presetStretch(
  preset: PlannerPreset,
  weeks: readonly PlannerWeek[],
  today: string,
): Stretch | undefined {
  const current = weekOf(weeks, today);
  if (!current) {
    return undefined;
  }
  const next = weeks[weeks.indexOf(current) + 1];
  const start = clampDate(today, current.start, current.end);
  switch (preset) {
    case 'this-week':
      return { start, end: current.end };
    case 'next-week':
      return next ? { start: next.start, end: next.end } : undefined;
    case 'two-weeks':
      return next ? { start, end: next.end } : undefined;
  }
}

/**
 * A stretch held to what the planner can show: no earlier than today or opening night, no later
 * than the season's last day, no longer than the BFF rates, and never ending before it starts.
 */
export function clampStretch(
  stretch: Stretch,
  weeks: readonly PlannerWeek[],
  today: string,
): Stretch | undefined {
  if (weeks.length === 0) {
    return undefined;
  }
  const last = weeks[weeks.length - 1].end;
  const start = clampDate(stretch.start, earliestStart(weeks, today), last);
  const end = clampDate(stretch.end, start, latestEnd(weeks, start));
  return { start, end };
}

/** The first night a stretch may start on: today, or opening night if that is later. */
export function earliestStart(weeks: readonly PlannerWeek[], today: string): string {
  const first = weeks[0]?.start ?? today;
  const last = weeks[weeks.length - 1]?.end ?? today;
  return clampDate(today, first, last);
}

/** The last night a stretch from a start may end on: the season's end, or the longest stretch the BFF rates. */
export function latestEnd(weeks: readonly PlannerWeek[], start: string): string {
  const last = weeks[weeks.length - 1]?.end ?? start;
  const longest = addDays(start, MAX_STRETCH_DAYS - 1);
  return longest < last ? longest : last;
}

export function sameStretch(a: Stretch | undefined, b: Stretch | undefined): boolean {
  return !!a && !!b && a.start === b.start && a.end === b.end;
}

/** ISO dates compare as strings, so a clamp is two comparisons. */
export function clampDate(value: string, min: string, max: string): string {
  if (value < min) {
    return min;
  }
  return value > max ? max : value;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime());
}

export function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Week 3", or "Weeks 3 to 5": the weeks a stretch touches. */
export function weeksTitle(weeks: readonly PlannerWeek[], stretch: Stretch): string {
  const touched = weeks.filter((week) => week.end >= stretch.start && week.start <= stretch.end);
  if (touched.length === 0) {
    return '';
  }
  const first = touched[0].week;
  const last = touched[touched.length - 1].week;
  return first === last ? `Week ${first}` : `Weeks ${first} to ${last}`;
}

/** The column of a Monday-first week a date falls in: 1 for a Monday, 7 for a Sunday. */
export function weekColumn(iso: string): number {
  return ((parseDate(iso).getUTCDay() + 6) % 7) + 1;
}

/** "Oct 19 to Oct 25". */
export function stretchLabel(start: string, end: string): string {
  return `${formatDay(start)} to ${formatDay(end)}`;
}

export function dayName(day: PlannerDay): string {
  return weekdayName(day.date);
}

/** "Thu". */
export function weekdayName(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/**
 * The days of the week before a stretch starts, so its first row of nights can be drawn as the
 * Monday-to-Sunday week it is part of: three days before a Thursday, none before a Monday.
 */
export function leadingDays(start: string): string[] {
  const column = weekColumn(start);
  return Array.from({ length: column - 1 }, (_, index) => addDays(start, index - column + 1));
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
