import { TeamSchedule } from '../api/models/team-schedule';
import { nhlTeamKey } from '../models/nhl-team';
import { Projection } from '../models/projection.model';
import { RATE_STAT_KEYS, SCORING_STAT_KEYS } from '../models/stat-key.model';
import { FreeAgent } from '../services/streamer-planner-free-agents.service';

/** The position groups, in the order a lineup lists them. */
export const PLANNER_POSITIONS = ['C', 'LW', 'RW', 'D', 'G'] as const;
export type PlannerPositionGroup = (typeof PLANNER_POSITIONS)[number];

/**
 * How many players the list opens with, and how many more each press of "Show more" adds. About
 * the depth of the team table beside it; the rest is a press away, never out of reach.
 */
export const FREE_AGENTS_PAGE = 25;

/** How many players the cards over the tables show. */
export const TOP_OPTIONS = 3;

/**
 * The decimals the ranking engine keeps on a stat before scoring it. The engine rounds to what a
 * season table shows, a whole number by default, which is coarse for a week: 0.4 goals scored as
 * none, 1.4 wins as one. Two decimals leave the line as the model projected it.
 */
export const WEEK_DECIMALS: Readonly<Record<string, number>> = Object.fromEntries(
  SCORING_STAT_KEYS.map((key) => [key, 2]),
);

export interface RankedFreeAgent {
  readonly player: FreeAgent;
  /** Fantasy points or a z-score, whichever the league scores by, over the nights counted. */
  readonly score: number;
  readonly rank: number;
  /** Games he is expected to play on the nights counted. */
  readonly games: number;
}

/**
 * The ranked players eligible at any of the positions picked, in the order they were ranked. No
 * position picked is every player: the filter narrows the one list, it never empties it. A player
 * eligible at two positions is listed once, under either.
 */
export function filterByPositions(
  ranked: readonly RankedFreeAgent[],
  positions: ReadonlySet<PlannerPositionGroup>,
): readonly RankedFreeAgent[] {
  if (positions.size === 0) {
    return ranked;
  }
  return ranked.filter((row) =>
    row.player.positions.some((position) => positions.has(position as PlannerPositionGroup)),
  );
}

/** The teams the server rated, findable by a club abbreviation in any platform's spelling. */
export function teamsByKey(teams: readonly TeamSchedule[]): Map<string, TeamSchedule> {
  return new Map(teams.map((team) => [nhlTeamKey(team.team) ?? team.team, team]));
}

/**
 * The share of a player's club games that fall on the nights counted, which is what his projected
 * line over the stretch is scaled by. One while every night is counted, and for a club the page
 * cannot find a schedule for, so an unmatched spelling costs nothing but the scaling.
 */
export function nightsFactor(
  player: FreeAgent,
  teams: ReadonlyMap<string, TeamSchedule>,
  counted: ReadonlySet<string>,
  everyNightCounted: boolean,
): number {
  if (everyNightCounted) {
    return 1;
  }
  const club = teams.get(nhlTeamKey(player.teamAbbrev) ?? '');
  if (!club || club.schedule.length === 0) {
    return 1;
  }
  return club.schedule.filter((game) => counted.has(game.date)).length / club.schedule.length;
}

/**
 * The projection with its counting stats scaled to the nights counted. A rate (shooting or save
 * percentage, goals-against average) and the ice time per game are the season's own and stay.
 */
export function scaledProjection(projection: Projection, factor: number): Projection {
  if (factor === 1) {
    return projection;
  }
  const rates: ReadonlySet<string> = new Set(RATE_STAT_KEYS);
  const scoring = Object.fromEntries(
    Object.entries(projection.stats.scoring).map(([key, value]) => [
      key,
      rates.has(key) ? value : value * factor,
    ]),
  );
  const utility = Object.fromEntries(
    Object.entries(projection.stats.utility).map(([key, value]) => [
      key,
      key === 'toiPerGame' ? value : value * factor,
    ]),
  );
  return { ...projection, stats: { scoring, utility } } as Projection;
}

/** Seconds as minutes and seconds, the way ice time is written: 1052 is 17:32. */
export function formatToi(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Games to one decimal where the expectation is fractional; a whole number as it is. */
export function formatGames(games: number): string {
  return Number.isInteger(games) ? games.toString() : games.toFixed(1);
}
