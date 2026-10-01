import { TeamSchedule } from '../api/models/team-schedule';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import { nhlTeamKey } from '../models/nhl-team';
import { Projection } from '../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  RATE_STAT_KEYS,
  SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../models/stat-key.model';
import { STAT_LABELS } from '../pipes/stat-label.pipe';
import { STAT_FULL_NAMES } from '../pipes/stat-tooltip.pipe';
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
  /** His projection over the nights counted: the one the score was reached from. */
  readonly line: Projection;
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

/** One stat of a player's line, as the list writes it. */
export interface LineStat {
  readonly key: ScoringStatKey;
  /** "G", "SOG": short enough for a league's whole set of categories to share a line. */
  readonly label: string;
  /** "Goals", "Shots on Goal": what the label stands for. */
  readonly name: string;
  readonly value: string;
}

/** Where the app's own label is a word, the abbreviation a box score uses for it. */
const SHORT_LABELS: Partial<Record<ScoringStatKey, string>> = {
  goals: 'G',
  assists: 'A',
  hits: 'HIT',
  blocks: 'BLK',
  w: 'W',
  l: 'L',
  sho: 'SHO',
};

/** Counts that run to dozens within a week, where the model's fraction says nothing. */
const WHOLE_COUNTS: ReadonlySet<ScoringStatKey> = new Set(['sv', 'sa', 'shifts']);

function formatLineStat(key: ScoringStatKey, value: number): string {
  if ((RATE_STAT_KEYS as readonly string[]).includes(key)) {
    return value.toFixed(DEFAULT_DECIMAL_SETTINGS[key]);
  }
  if (key === 'toi') {
    return formatToi(value) || '0:00';
  }
  // A week's counts are small enough for a decimal to carry the difference between two players;
  // past a hundred it is noise, and it would not fit the cell.
  const text = value.toFixed(WHOLE_COUNTS.has(key) || Math.abs(value) >= 100 ? 0 : 1);
  return key === 'plusMinus' && Number(text) > 0 ? `+${text}` : text;
}

/**
 * A player's line in the categories his league scores, in the league's own order: a skater's in
 * its skater categories, a goalie's in its goalie ones. A category the model gave no number for
 * is left out rather than written as the zero the ranking engine was handed in its place.
 */
export function lineStats(
  row: RankedFreeAgent,
  categories: readonly ScoringStatKey[],
): readonly LineStat[] {
  const own: readonly string[] =
    row.line.type === 'skater' ? SKATER_SCORING_STAT_KEYS : GOALIE_SCORING_STAT_KEYS;
  const scoring = row.line.stats.scoring as Record<string, number>;
  return categories
    .filter((key) => own.includes(key) && row.player.projected.has(key))
    .map((key) => ({
      key,
      label: SHORT_LABELS[key] ?? STAT_LABELS[key],
      name: STAT_FULL_NAMES[key],
      value: formatLineStat(key, scoring[key] ?? 0),
    }));
}

/**
 * How many stats a line holds so that its lines come out even: seven categories that do not fit
 * one line are four and three, not six and one.
 */
export function statsPerLine(count: number, most: number): number {
  return count === 0 ? 1 : Math.ceil(count / Math.ceil(count / most));
}

/**
 * The grid the lines of one position share, as CSS grid tracks, with at most `most` stats to a
 * line. A track is as wide as the widest stat that falls in it on any of the players (in `ch`,
 * a character for each of the value's and the label's, and one for the space between and the
 * letters' extra width), so a category is in the same place on every player and reads down the
 * list as a column, and a short one ("1.8 G") takes no more room than it needs. A track may give
 * a little where the table is a few pixels short, rather than push the table wider than its card.
 */
export function lineGrid(lines: readonly (readonly LineStat[])[], most: number): string {
  const widths: number[] = [];
  for (const line of lines) {
    line.forEach((stat, index) => {
      widths[index] = Math.max(widths[index] ?? 0, stat.value.length + stat.label.length + 1);
    });
  }
  const perLine = statsPerLine(widths.length, most);
  return Array.from({ length: Math.min(perLine, widths.length) }, (_, column) =>
    Math.max(...widths.filter((_, index) => index % perLine === column)),
  )
    .map((width) => `minmax(0, ${width}ch)`)
    .join(' ');
}
