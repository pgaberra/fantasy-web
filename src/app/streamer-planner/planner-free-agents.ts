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

/** The skater position groups, in the order a lineup lists them. Goalies are a list of their own. */
export const PLANNER_POSITIONS = ['C', 'LW', 'RW', 'D'] as const;
export type PlannerPositionGroup = (typeof PLANNER_POSITIONS)[number];

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
 * The skaters or the goalies of a ranking, in its order, each with his place among his own kind:
 * the two fill different roster slots and score different categories, so a place among both says
 * less than a place among the players he can be picked instead of.
 */
export function ofKind(
  ranked: readonly RankedFreeAgent[],
  kind: Projection['type'],
): readonly RankedFreeAgent[] {
  return ranked
    .filter((row) => row.line.type === kind)
    .map((row, index) => ({ ...row, rank: index + 1 }));
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

/**
 * Games as a whole number, the way a schedule counts them. The expectation is fractional, and to
 * one decimal it read as two kinds of number: 2.97 came out "3.0" beside a "3" the arithmetic
 * happened to land on. The fraction still scales the line and the per-game score.
 */
export function formatGames(games: number): string {
  return Math.round(games).toString();
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

/** A category as the list names it: the short label of a column, and what it stands for. */
export function categoryColumn(key: ScoringStatKey): LineColumn {
  return { key, label: SHORT_LABELS[key] ?? STAT_LABELS[key], name: STAT_FULL_NAMES[key] };
}

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
    .map((key) => ({ ...categoryColumn(key), value: formatLineStat(key, scoring[key] ?? 0) }));
}

/** A category as the list heads a column with it. */
export type LineColumn = Pick<LineStat, 'key' | 'label' | 'name'>;

/**
 * The columns the lines of one kind of player are read in: every category any of them has a
 * number for, in the league's order. A category none of them has is no column, rather than an
 * empty one.
 */
export function lineColumns(
  lines: readonly (readonly LineStat[])[],
  categories: readonly ScoringStatKey[],
): readonly LineColumn[] {
  const found = new Map<ScoringStatKey, LineColumn>();
  for (const stat of lines.flat()) {
    if (!found.has(stat.key)) {
      found.set(stat.key, { key: stat.key, label: stat.label, name: stat.name });
    }
  }
  return categories.flatMap((key) => found.get(key) ?? []);
}
