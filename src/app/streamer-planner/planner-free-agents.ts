import { PlannerCrease } from '../api/models/planner-crease';
import { TeamSchedule } from '../api/models/team-schedule';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import { nhlTeamKey } from '../models/nhl-team';
import { Projection } from '../models/projection.model';
import { compareStatValues, defaultSortDirection } from '../models/sorting';
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
import { DropRoom, fitsDrop, fitsRoom, NightRoom } from './planner-lineup';

/** The skater position groups, in the order a lineup lists them. */
export const PLANNER_POSITIONS = ['C', 'LW', 'RW', 'D'] as const;
export type PlannerPositionGroup = (typeof PLANNER_POSITIONS)[number];

/** The positions the free agents can be narrowed to: the skaters', and the goalies' one. */
export const FREE_AGENT_POSITIONS = [...PLANNER_POSITIONS, 'G'] as const;
export type FreeAgentPosition = (typeof FREE_AGENT_POSITIONS)[number];

/** How many places among everyone available are set off as the best picks. */
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
  /** Games he is expected to play on the nights counted; for a goalie, the starts he is given. */
  readonly games: number;
  /**
   * Games more he would play on the nights counted where the user's lineup has room for him only
   * once one of the user's players is dropped. Each would replace the dropped player's game, so
   * they are neither in {@link games} nor scored. Absent while the list is not ranked by room.
   */
  readonly dropGames?: number;
  /**
   * His line and score with the {@link dropGames} played too: what he would give, not what the
   * swap nets, since the dropped player's games go with him. Absent where a drop adds nothing.
   */
  readonly lifted?: LiftedLine;
}

/** A player's line over his own games and the ones a drop would add, and its score. */
export interface LiftedLine {
  readonly line: Projection;
  readonly score: number;
}

/**
 * The ranked players eligible at any of the positions picked, in the order they were ranked. No
 * position picked is every player: the filter narrows the one list, it never empties it. A player
 * eligible at two positions is listed once, under either.
 */
export function filterByPositions(
  ranked: readonly RankedFreeAgent[],
  positions: ReadonlySet<FreeAgentPosition>,
): readonly RankedFreeAgent[] {
  if (positions.size === 0) {
    return ranked;
  }
  return ranked.filter((row) =>
    row.player.positions.some((position) => positions.has(position as FreeAgentPosition)),
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
 * The share of a player's club games that fall on nights counted and with room for him in the
 * user's own lineup: the games he would actually start if picked up. A night his club plays with
 * every seat he could take already filled scores him nothing, however few games are on it. One
 * for a club the page cannot find a schedule for, as in {@link nightsFactor}.
 */
export function roomFactor(
  player: FreeAgent,
  teams: ReadonlyMap<string, TeamSchedule>,
  counted: ReadonlySet<string>,
  rooms: ReadonlyMap<string, NightRoom>,
): number {
  const club = teams.get(nhlTeamKey(player.teamAbbrev) ?? '');
  if (!club || club.schedule.length === 0) {
    return 1;
  }
  const started = club.schedule.filter(
    (game) => counted.has(game.date) && fitsRoom(player.positions, rooms.get(game.date)),
  );
  return started.length / club.schedule.length;
}

/**
 * The share of a player's club games that fall on nights counted where only a drop makes room
 * for him ({@link fitsDrop}): the games he would start if he came in for one of the user's
 * players. None for a club the page cannot find a schedule for, since nothing says when it plays.
 */
export function dropFactor(
  player: FreeAgent,
  teams: ReadonlyMap<string, TeamSchedule>,
  counted: ReadonlySet<string>,
  rooms: ReadonlyMap<string, NightRoom>,
  dropRooms: ReadonlyMap<string, DropRoom>,
): number {
  const club = teams.get(nhlTeamKey(player.teamAbbrev) ?? '');
  if (!club || club.schedule.length === 0) {
    return 0;
  }
  const opened = club.schedule.filter(
    (game) =>
      counted.has(game.date) &&
      fitsDrop(player.positions, rooms.get(game.date), dropRooms.get(game.date)),
  );
  return opened.length / club.schedule.length;
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

/**
 * The starts each listed goalie is given on the nights counted: whole games, each of a club's
 * counted games handed to one goalie of its crease.
 *
 * The model's crease is a chance a night (a starter at 0.7, his backup at 0.3), and a game is
 * started by one man, not a share of it by each. Scaled player by player, New Jersey's one game
 * of a weekend left both its free agents at about half a start: each read "0" games and still
 * carried a line. So a club's counted games are given out together, as the split of them likeliest
 * to happen: one game goes to the likeliest starter, and four at seventy-thirty go three and one,
 * which is what a week of them looks like, rather than four and none. The goalies a league has
 * rostered are in the crease as well, so a free agent behind one of them is given none.
 *
 * Keyed by the platform's player id; a goalie in no crease is not in it.
 */
export function projectedStarts(
  creases: readonly PlannerCrease[],
  counted: ReadonlySet<string>,
  everyNightCounted: boolean,
): ReadonlyMap<string, number> {
  const starts = new Map<string, number>();
  for (const crease of creases) {
    const split = likeliestSplit(crease, (date) => everyNightCounted || counted.has(date));
    crease.goalies.forEach((goalie, index) => {
      if (goalie.playerId !== undefined) {
        starts.set(goalie.playerId, split[index]);
      }
    });
  }
  return starts;
}

interface Split {
  readonly counts: readonly number[];
  readonly chance: number;
}

/**
 * Two splits whose chances differ by less than this share of either are a tie: what parts them
 * is the arithmetic's rounding, not one being likelier.
 */
const TIED = 1e-9;

/**
 * The likeliest number of starts each goalie of a crease makes on the nights kept, with one more
 * count, last, for a goalie the model does not name: a night whose shares come to less than one
 * start leaves the rest to him. Each night is its own draw from that night's shares, so the answer
 * is the commonest outcome of their sum, found by walking the nights and keeping every split
 * reachable with its chance — a few hundred at most over a month of a three-man crease. A tie goes
 * to the split giving more to the goalie listed first, who has the most starts over the stretch.
 */
function likeliestSplit(crease: PlannerCrease, kept: (date: string) => boolean): readonly number[] {
  const nights = new Set(
    crease.goalies.flatMap((goalie) => goalie.nights.map((night) => night.date)),
  );
  let splits: Split[] = [{ counts: new Array(crease.goalies.length + 1).fill(0), chance: 1 }];
  for (const date of [...nights].filter(kept)) {
    const chances = nightChances(crease, date);
    const next = new Map<string, Split>();
    for (const split of splits) {
      chances.forEach((chance, index) => {
        if (chance <= 0) {
          return;
        }
        const counts = split.counts.map((count, at) => (at === index ? count + 1 : count));
        const key = counts.join();
        next.set(key, { counts, chance: (next.get(key)?.chance ?? 0) + split.chance * chance });
      });
    }
    splits = [...next.values()];
  }
  return splits.reduce((best, split) => (likelier(split, best) ? split : best), splits[0]).counts;
}

/** Each goalie's chance of starting the night, and last the unnamed goalie's: one in all. */
function nightChances(crease: PlannerCrease, date: string): number[] {
  const shares = crease.goalies.map((goalie) =>
    Math.max(0, goalie.nights.find((night) => night.date === date)?.share ?? 0),
  );
  const total = shares.reduce((sum, share) => sum + share, 0);
  // A crease whose starts run past the schedule (a goalie traded in with his own) is held to the
  // one start a night has.
  return total > 1 ? [...shares.map((share) => share / total), 0] : [...shares, 1 - total];
}

function likelier(split: Split, than: Split): boolean {
  if (Math.abs(split.chance - than.chance) > TIED * Math.max(split.chance, than.chance)) {
    return split.chance > than.chance;
  }
  for (let at = 0; at < split.counts.length; at++) {
    if (split.counts[at] !== than.counts[at]) {
      return split.counts[at] > than.counts[at];
    }
  }
  return false;
}

/**
 * A goalie's projection over the starts he is given: his line over the stretch, which was
 * projected over `expectedStarts`, a start at a time, times them. Given none, every number is
 * nought, his rates too: a goalie who does not play has no save percentage or goals-against
 * average to help or hurt a team's, and left in, the ranking would weigh them at an average
 * goalie's minutes.
 */
export function startsProjection(
  projection: Projection,
  expectedStarts: number,
  starts: number,
): Projection {
  if (starts > 0 && expectedStarts > 0) {
    return scaledProjection(projection, starts / expectedStarts);
  }
  const nought = (stats: Record<string, number>) =>
    Object.fromEntries(Object.keys(stats).map((key) => [key, 0]));
  return {
    ...projection,
    stats: { scoring: nought(projection.stats.scoring), utility: nought(projection.stats.utility) },
  } as Projection;
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
  // A goalie given no start has no rate to write: nought would read as a save percentage of none.
  const benched = row.line.type === 'goalie' && row.games === 0;
  const rates: readonly string[] = RATE_STAT_KEYS;
  return categories
    .filter((key) => own.includes(key) && row.player.projected.has(key))
    .map((key) => ({
      ...categoryColumn(key),
      value: benched && rates.includes(key) ? NO_RATE : formatLineStat(key, scoring[key] ?? 0),
    }));
}

/** What a rate over no games is written as. */
export const NO_RATE = '—';

/**
 * What the games a drop would add put on his line, a category a stat, in the table's columns: the
 * counts that grow by them, written as "+0.4". A rate is the season's own and stays, a count the
 * games leave unmoved says nothing, and neither is listed. Empty where a drop adds nothing.
 */
export function liftStats(
  row: RankedFreeAgent,
  categories: readonly ScoringStatKey[],
): readonly LineStat[] {
  const lifted = row.lifted;
  if (!lifted) {
    return [];
  }
  const own: readonly string[] =
    row.line.type === 'skater' ? SKATER_SCORING_STAT_KEYS : GOALIE_SCORING_STAT_KEYS;
  const rates: readonly string[] = RATE_STAT_KEYS;
  const before = row.line.stats.scoring as Record<string, number>;
  const after = lifted.line.stats.scoring as Record<string, number>;
  return categories
    .filter((key) => own.includes(key) && row.player.projected.has(key) && !rates.includes(key))
    .map((key) => ({ key, more: (after[key] ?? 0) - (before[key] ?? 0) }))
    .filter(({ key, more }) => formatLineStat(key, more) !== formatLineStat(key, 0))
    .map(({ key, more }) => {
      const text = formatLineStat(key, more);
      // Plus-minus signs itself; a count that fell is a sign of a line the model cut.
      const signed = text.startsWith('+') || text.startsWith('-') ? text : `+${text}`;
      return { ...categoryColumn(key), value: signed };
    });
}

/** A category as the list heads a column with it. */
export type LineColumn = Pick<LineStat, 'key' | 'label' | 'name'>;

/**
 * The columns the lines are read in: every category any of them has a number for, in the league's
 * order. A category none of them has is no column, rather than an empty one. Skaters and goalies
 * share the list, so a skater's row is blank under a goalie's category and a goalie's under a
 * skater's: a column still means one category on every row that has it.
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

// --- Sorting the list ----------------------------------------------------------------------------

/** A column the free agents can be sorted by: one about the player, or a category of his line. */
export type FreeAgentSortKey = 'name' | 'score' | 'perGame' | 'games' | 'toi' | ScoringStatKey;

export interface FreeAgentSort {
  readonly key: FreeAgentSortKey;
  readonly descending: boolean;
}

/** The list as ranked: best first by the score, which is what the # column counts. */
export const RANKED_ORDER: FreeAgentSort = { key: 'score', descending: true };

export function isRankedOrder(sort: FreeAgentSort): boolean {
  return sort.key === RANKED_ORDER.key && sort.descending === RANKED_ORDER.descending;
}

/**
 * Sorts by a column, best first, whichever end of the scale that is (`defaultSortDirection`: a
 * name from A, GAA from the lowest, everything else from the highest); the same column again turns
 * the order round.
 */
export function nextSort(current: FreeAgentSort, key: FreeAgentSortKey): FreeAgentSort {
  if (current.key === key) {
    return { key, descending: !current.descending };
  }
  const firstWay = key === 'score' || key === 'perGame' || key === 'games' || key === 'toi';
  return { key, descending: firstWay || defaultSortDirection(key) === 'desc' };
}

/**
 * The number a player sorts by in a column, or null where the column says nothing about him: a
 * category of the other kind, one the model gave him no number in, a rate over no games, a
 * goalie's ice time. Null is what the table leaves blank or writes as a dash.
 */
export function sortValue(
  row: RankedFreeAgent,
  key: Exclude<FreeAgentSortKey, 'name'>,
): number | null {
  switch (key) {
    case 'score':
      return row.score;
    case 'perGame':
      return row.games > 0 ? row.score / row.games : null;
    case 'games':
      return row.games;
    case 'toi':
      return row.player.projection.type === 'skater'
        ? (row.player.projection.stats.utility.toiPerGame ?? null)
        : null;
    default: {
      const own: readonly string[] =
        row.line.type === 'skater' ? SKATER_SCORING_STAT_KEYS : GOALIE_SCORING_STAT_KEYS;
      if (!own.includes(key) || !row.player.projected.has(key)) {
        return null;
      }
      const rates: readonly string[] = RATE_STAT_KEYS;
      if (row.games === 0 && rates.includes(key)) {
        return null;
      }
      const value = (row.line.stats.scoring as Record<string, number>)[key];
      return typeof value === 'number' ? value : null;
    }
  }
}

/**
 * The list in the order asked for. A player the column says nothing about goes last whichever way
 * it points, and players level on it keep their ranked order, so a sort is the ranking re-cut
 * rather than reshuffled. The ranked order itself is the list as it came.
 */
export function sortFreeAgents(
  rows: readonly RankedFreeAgent[],
  sort: FreeAgentSort,
): readonly RankedFreeAgent[] {
  if (isRankedOrder(sort)) {
    return rows;
  }
  const sign = sort.descending ? -1 : 1;
  const { key } = sort;
  if (key === 'name') {
    return [...rows].sort(
      (a, b) => sign * a.player.name.localeCompare(b.player.name) || a.rank - b.rank,
    );
  }
  return [...rows].sort(
    (a, b) => compareStatValues(sortValue(a, key), sortValue(b, key), sign) || a.rank - b.rank,
  );
}
