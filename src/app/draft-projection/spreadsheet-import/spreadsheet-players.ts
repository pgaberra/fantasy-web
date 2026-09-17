import { Player } from '../../models/player.model';
import { SkaterPosition } from '../../models/position.model';
import { editDistance, spellingKey } from './spreadsheet-spellings';
import { Cell } from './spreadsheet-table';

/**
 * Finding the pool's player behind a name typed into somebody else's spreadsheet.
 *
 * A sheet has names and perhaps a club, never our ids, and its spelling is its own: "Nathan
 * Mackinnon", "Tim Stutzle", "Mitch Marner", "McDavid, Connor". A match is therefore made on a
 * normalised name, then on the spellings two lists disagree on (see `spreadsheet-spellings.ts`),
 * and only where it is unambiguous. The club is a tie-breaker and never a
 * requirement, because the pool's club is stale for a good share of skaters and a sheet's may be
 * a season old; a wrong club must not cost a match that the name alone makes.
 */

/** A position as the pool has it, or G for a goalie. */
export type PlayerPosition = SkaterPosition | 'G';

/**
 * The positions a sheet's position cell names: "C", "LW/RW", "C, LW", and the depth-chart spellings
 * "C1", "LD2", "RD1" (a left or right defenceman is a D). "F" is any forward and "W" either wing.
 */
export function positionsFrom(cell: Cell | undefined): ReadonlySet<PlayerPosition> {
  const positions = new Set<PlayerPosition>();
  for (const token of String(cell ?? '')
    .toUpperCase()
    .split(/[^A-Z]+/)) {
    if (token === 'C' || token === 'LW' || token === 'RW' || token === 'D' || token === 'G') {
      positions.add(token);
    } else if (token === 'LD' || token === 'RD') {
      positions.add('D');
    } else if (token === 'W') {
      positions.add('LW').add('RW');
    } else if (token === 'F') {
      positions.add('C').add('LW').add('RW');
    }
  }
  return positions;
}

function playsAny(player: Player, positions: ReadonlySet<PlayerPosition>): boolean {
  if (player.type === 'goalie') {
    return positions.has('G');
  }
  return [...player.positions].some((position) => positions.has(position));
}

export type MatchResult =
  /** `respelled` when the sheet spells the name differently from the pool, for the user to check. */
  | { kind: 'matched'; player: Player; respelled: boolean }
  | { kind: 'ambiguous'; candidates: Player[] }
  | { kind: 'not-found' };

/** Clubs whose abbreviation differs between sources, folded to one spelling. */
const TEAM_ALIASES: Record<string, string> = {
  LA: 'LAK',
  TB: 'TBL',
  NJ: 'NJD',
  SJ: 'SJS',
  MON: 'MTL',
  CLB: 'CBJ',
  NAS: 'NSH',
  WAS: 'WSH',
  CAL: 'CGY',
  WIN: 'WPG',
  UTAH: 'UTA',
  UHC: 'UTA',
};

export function teamKey(team: Cell | undefined): string | null {
  if (team === null || team === undefined) {
    return null;
  }
  const upper = String(team).trim().toUpperCase();
  if (!upper) {
    return null;
  }
  return TEAM_ALIASES[upper] ?? upper;
}

/**
 * A name reduced to what two spellings of it share: no accents, no case, no dots or apostrophes,
 * hyphens as spaces, and "Last, First" turned round.
 */
export function nameKey(name: Cell | undefined): string {
  let text = String(name ?? '').trim();
  const comma = text.indexOf(',');
  if (comma > 0) {
    text = `${text.slice(comma + 1)} ${text.slice(0, comma)}`;
  }
  return (
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      // The letters that carry their mark inside them and so survive decomposition.
      .replace(/ø/g, 'o')
      .replace(/æ/g, 'ae')
      .replace(/ł/g, 'l')
      .replace(/[.'’`]/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function lastName(key: string): string {
  const parts = key.split(' ');
  // "Jr", "Sr" and roman numerals follow the surname rather than being it.
  while (parts.length > 2 && /^(jr|sr|ii|iii|iv)$/.test(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts[parts.length - 1] ?? '';
}

export class PlayerMatcher {
  private readonly byName = new Map<string, Player[]>();
  private readonly bySpelling = new Map<string, Player[]>();
  private readonly byLastName = new Map<string, Player[]>();
  private readonly spellings: { key: string; player: Player }[] = [];

  constructor(players: readonly Player[]) {
    for (const player of players) {
      const key = nameKey(player.name);
      if (!key) {
        continue;
      }
      const spelling = spellingKey(key);
      push(this.byName, key, player);
      push(this.bySpelling, spelling, player);
      push(this.byLastName, lastName(key), player);
      this.spellings.push({ key: spelling, player });
    }
  }

  /**
   * The pool player a sheet's row names, trying the strictest reading first: the name as written,
   * then its spelling-insensitive key (Tommy Novak, Yegor Chinakhov), then a first name written
   * short or as an initial, then a spelling one or two letters off. Every reading after the first
   * is marked `respelled`, so the dialog can show what it took the name to mean.
   */
  match(name: Cell, team?: Cell, position?: Cell): MatchResult {
    const key = nameKey(name);
    if (!key) {
      return { kind: 'not-found' };
    }
    const sheetTeam = teamKey(team);
    const sheetPositions = positionsFrom(position);
    const choose = (candidates: Player[], respelled: boolean) =>
      pick(candidates, sheetTeam, sheetPositions, respelled);

    const exact = this.byName.get(key);
    if (exact) {
      return choose(exact, false);
    }
    const spelling = spellingKey(key);
    const sameSpelling = this.bySpelling.get(spelling);
    if (sameSpelling) {
      return choose(sameSpelling, true);
    }
    if (!key.includes(' ')) {
      return { kind: 'not-found' };
    }
    // A first name written short or as an initial ("Mitch Marner", "C. McDavid"): the surname has
    // to agree and the first names have to share their start.
    const first = key.split(' ')[0];
    const shortened = (this.byLastName.get(lastName(key)) ?? []).filter((player) => {
      const poolFirst = nameKey(player.name).split(' ')[0];
      return poolFirst.startsWith(first) || first.startsWith(poolFirst);
    });
    if (shortened.length) {
      return choose(shortened, true);
    }
    const close = this.closeSpellings(spelling);
    return close.length ? choose(close, true) : { kind: 'not-found' };
  }

  /**
   * The players whose name is the fewest letters away, within one letter for a short name and two
   * for a longer one. A retired player the pool no longer holds is several letters from anyone, so
   * this finds nobody for him rather than a stranger.
   */
  private closeSpellings(spelling: string): Player[] {
    const limit = spelling.length <= 12 ? 1 : 2;
    let best = limit + 1;
    let found: Player[] = [];
    for (const candidate of this.spellings) {
      const distance = editDistance(spelling, candidate.key, Math.min(limit, best));
      if (distance < best) {
        best = distance;
        found = [candidate.player];
      } else if (distance === best && distance <= limit) {
        found.push(candidate.player);
      }
    }
    return best <= limit ? found : [];
  }

  /**
   * How many of these cells name a pool player. The name column is found by this when its heading
   * does not say so, which is common: a sheet's first column is often headed by a merged cell above.
   */
  countMatches(cells: Cell[]): number {
    return cells.filter(
      (cell) =>
        typeof cell === 'string' &&
        (this.byName.has(nameKey(cell)) || this.bySpelling.has(spellingKey(nameKey(cell)))),
    ).length;
  }
}

/**
 * One player out of several who fit the name, narrowed by the sheet's club and then its position,
 * each applied only where it leaves someone: two Elias Petterssons on one club are told apart by one
 * being a centre and the other a defenceman.
 */
function pick(
  candidates: Player[],
  team: string | null,
  positions: ReadonlySet<PlayerPosition>,
  respelled: boolean,
): MatchResult {
  let narrowed = candidates;
  if (narrowed.length > 1 && team) {
    const sameClub = narrowed.filter((player) => teamKey(player.teamAbbrev) === team);
    narrowed = sameClub.length ? sameClub : narrowed;
  }
  if (narrowed.length > 1 && positions.size) {
    const samePosition = narrowed.filter((player) => playsAny(player, positions));
    narrowed = samePosition.length ? samePosition : narrowed;
  }
  return narrowed.length === 1
    ? { kind: 'matched', player: narrowed[0], respelled }
    : { kind: 'ambiguous', candidates: narrowed };
}

function push(map: Map<string, Player[]>, key: string, player: Player): void {
  const list = map.get(key);
  if (list) {
    list.push(player);
  } else {
    map.set(key, [player]);
  }
}
