import {
  GOALIE_STAT_KEYS,
  SKATER_STAT_KEYS,
  StatKey,
  UtilityStatKey,
} from '../../models/stat-key.model';
import { Cell } from './spreadsheet-table';

/** What a column is taken to hold. */
export type ColumnRole = { kind: 'name' } | { kind: 'team' } | { kind: 'stat'; stat: StatKey };

/** Every stat a sheet can fill, skaters' first, each once. */
export const IMPORTABLE_STATS: readonly StatKey[] = [
  ...new Set<StatKey>([...SKATER_STAT_KEYS, ...GOALIE_STAT_KEYS]),
];

/**
 * The headings each stat goes by in the sheets people actually keep, compared after
 * `headingKey`. Where two stats share an abbreviation the common reading wins (`PPG` is
 * power-play goals, as Yahoo and ESPN print it), and the user can change the guess.
 */
const STAT_HEADINGS: Record<StatKey, readonly string[]> = {
  gp: ['gp', 'games', 'gamesplayed', 'g p'],
  toiPerGame: ['atoi', 'toi/g', 'toi/gp', 'toipergame', 'avgtoi', 'toig', 'toigp'],
  goals: ['g', 'goals'],
  assists: ['a', 'assists', 'ast'],
  points: ['p', 'pts', 'points'],
  plusMinus: ['+/-', 'plusminus', '+-', 'pm'],
  pim: ['pim', 'penaltyminutes'],
  ppg: ['ppg', 'powerplaygoals'],
  ppa: ['ppa', 'powerplayassists'],
  ppp: ['ppp', 'powerplaypoints'],
  shg: ['shg', 'shorthandedgoals'],
  sha: ['sha', 'shorthandedassists'],
  shp: ['shp', 'shorthandedpoints'],
  stpg: ['stpg'],
  stpa: ['stpa'],
  stp: ['stp'],
  gwg: ['gwg', 'gamewinninggoals'],
  hatTricks: ['hat', 'hattricks', 'hattrick'],
  sog: ['sog', 'shots', 's', 'shotsongoal'],
  shPct: ['s%', 'sh%', 'shpct', 'shooting%', 'shootingpct'],
  fw: ['fw', 'fow', 'faceoffwins', 'fo wins'],
  fl: ['fl', 'fol', 'faceofflosses'],
  hits: ['hit', 'hits'],
  blocks: ['blk', 'blks', 'blocks', 'bs', 'blockedshots'],
  defPoints: ['def', 'defpoints'],
  shifts: ['shifts', 'shft'],
  toi: ['toi', 'timeonice'],
  gs: ['gs', 'starts', 'gamesstarted'],
  w: ['w', 'wins'],
  l: ['l', 'losses'],
  otl: ['otl', 'ot', 'overtimelosses'],
  sho: ['so', 'sho', 'shutouts'],
  sa: ['sa', 'shotsagainst'],
  sv: ['sv', 'saves'],
  ga: ['ga', 'goalsagainst'],
  gaa: ['gaa', 'goalsagainstaverage'],
  svPct: ['sv%', 'svpct', 'save%', 'savepct'],
  winPct: ['w%', 'win%', 'winpct'],
};

const NAME_HEADINGS = ['player', 'name', 'playername', 'skater', 'goalie', 'fullname'];
const TEAM_HEADINGS = ['team', 'tm', 'nhlteam', 'club'];

const HEADING_TO_STAT = new Map<string, StatKey>();
for (const stat of IMPORTABLE_STATS) {
  for (const heading of STAT_HEADINGS[stat]) {
    HEADING_TO_STAT.set(headingKey(heading), stat);
  }
}

/** A heading with case, spacing and the punctuation that varies between sheets taken out. */
export function headingKey(heading: Cell): string {
  return String(heading ?? '')
    .toLowerCase()
    .replace(/[\s._]/g, '');
}

/**
 * The row the headings are on: of the first thirty, the one naming the most stats. A sheet made
 * for reading often carries a title, instructions or a row of weights above its headings.
 */
export function findHeadingRow(rows: Cell[][]): number {
  let best = 0;
  let bestCount = 0;
  rows.slice(0, 30).forEach((row, index) => {
    const count = row.filter((cell) => typeof cell === 'string' && isKnownHeading(cell)).length;
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  });
  return best;
}

function isKnownHeading(cell: string): boolean {
  const key = headingKey(cell);
  return HEADING_TO_STAT.has(key) || NAME_HEADINGS.includes(key) || TEAM_HEADINGS.includes(key);
}

/**
 * A first guess at every column, read from the headings. A stat claimed by an earlier column is not
 * claimed again: sheets that compute fantasy points repeat the stat headings over the weighted
 * copies, and the raw projection comes first.
 */
export function guessColumnRoles(headings: Cell[], columnCount: number): (ColumnRole | null)[] {
  const roles: (ColumnRole | null)[] = [];
  const claimed = new Set<string>();
  for (let column = 0; column < columnCount; column++) {
    const key = headingKey(headings[column] ?? null);
    let role: ColumnRole | null = null;
    if (NAME_HEADINGS.includes(key) && !claimed.has('name')) {
      role = { kind: 'name' };
    } else if (TEAM_HEADINGS.includes(key) && !claimed.has('team')) {
      role = { kind: 'team' };
    } else {
      const stat = HEADING_TO_STAT.get(key);
      if (stat && !claimed.has(stat)) {
        role = { kind: 'stat', stat };
      }
    }
    if (role) {
      claimed.add(role.kind === 'stat' ? role.stat : role.kind);
    }
    roles.push(role);
  }
  return roles;
}

/** A cell as a number, reading a decimal comma, a percent sign and a thousands space. */
export function numberFrom(cell: Cell): number | null {
  if (typeof cell === 'number') {
    return cell;
  }
  if (cell === null) {
    return null;
  }
  const text = cell.replace(/[\s%]/g, '').replace(/^\+/, '');
  const normalised = /^-?\d+,\d+$/.test(text) ? text.replace(',', '.') : text;
  // Digits, a sign and a point only: Number() alone would also take "0x1A" and "Infinity".
  if (normalised === '' || !/^[-\d.]+$/.test(normalised)) {
    return null;
  }
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** "22:15" as seconds, or null when the cell is not minutes and seconds. */
function secondsFromClock(cell: Cell): number | null {
  if (typeof cell !== 'string') {
    return null;
  }
  const match = /^(\d+):(\d{1,2})$/.exec(cell.trim());
  return match && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Turns one column's cells into the units the projection stores, deciding the sheet's unit from
 * the column as a whole rather than cell by cell: a column of 0.111 is a share and one of 11.1 is a
 * percentage, but one cell of 1.0 could be either.
 *
 * Time on ice is held in seconds. A sheet writes it as 22:15, as decimal minutes (22.25), or, when
 * Excel took the typed clock for a time of day, as a fraction of a day; each is recognised by its
 * size. Shooting percentage is held as a percentage and save and win percentage as shares, which is
 * how the app prints them.
 */
export function convertColumn(stat: StatKey, cells: Cell[]): (number | null)[] {
  if (stat === 'toiPerGame' || stat === 'toi') {
    return convertTime(stat, cells);
  }
  const values = cells.map(numberFrom);
  const present = values.filter((value): value is number => value !== null);
  if (stat === 'shPct' && present.length && present.every((value) => Math.abs(value) <= 1)) {
    return values.map((value) => (value === null ? null : value * 100));
  }
  if ((stat === 'svPct' || stat === 'winPct') && present.some((value) => value > 1)) {
    return values.map((value) => (value === null ? null : value / 100));
  }
  return values;
}

function convertTime(stat: UtilityStatKey | 'toi', cells: Cell[]): (number | null)[] {
  const numbers = cells.map((cell) => (secondsFromClock(cell) === null ? numberFrom(cell) : null));
  const present = numbers.filter((value): value is number => value !== null);
  const largest = present.length ? Math.max(...present) : 0;
  const perGame = stat === 'toiPerGame';
  let toSeconds: (value: number) => number;
  if (largest > 0 && largest < 1) {
    // A fraction of a day. Read as hours and minutes it would be a game of many hours, so it was
    // minutes and seconds typed into a time cell.
    toSeconds = (value) => (perGame && value * 86400 > 3600 ? value * 1440 : value * 86400);
  } else if (perGame) {
    // Nobody plays a hundred minutes a game, so anything that large is already seconds.
    toSeconds = (value) => (largest < 100 ? value * 60 : value);
  } else {
    // A season is at most about 2,200 minutes, and in seconds it runs well past that.
    toSeconds = (value) => (largest < 5000 ? value * 60 : value);
  }
  return cells.map((cell, index) => {
    const clock = secondsFromClock(cell);
    if (clock !== null) {
      return clock;
    }
    const value = numbers[index];
    return value === null ? null : Math.round(toSeconds(value));
  });
}
