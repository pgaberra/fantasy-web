import { Player } from '../../models/player.model';
import { Cell } from './spreadsheet-table';

/**
 * Finding the pool's player behind a name typed into somebody else's spreadsheet.
 *
 * A sheet has names and perhaps a club, never our ids, and its spelling is its own: "Nathan
 * Mackinnon", "Tim Stutzle", "Mitch Marner", "McDavid, Connor". A match is therefore made on a
 * normalised name, and only where it is unambiguous. The club is a tie-breaker and never a
 * requirement, because the pool's club is stale for a good share of skaters and a sheet's may be
 * a season old; a wrong club must not cost a match that the name alone makes.
 */

export type MatchResult =
  | { kind: 'matched'; player: Player }
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
  private readonly byLastName = new Map<string, Player[]>();

  constructor(players: readonly Player[]) {
    for (const player of players) {
      const key = nameKey(player.name);
      if (!key) {
        continue;
      }
      push(this.byName, key, player);
      push(this.byLastName, lastName(key), player);
    }
  }

  match(name: Cell, team: Cell | undefined): MatchResult {
    const key = nameKey(name);
    if (!key) {
      return { kind: 'not-found' };
    }
    const sheetTeam = teamKey(team);

    const exact = this.byName.get(key);
    if (exact) {
      return pick(exact, sheetTeam);
    }
    // A first name written short or as an initial ("Mitch Marner", "C. McDavid"). The surname has
    // to agree and the first names have to share their start; among those, one player on the
    // sheet's club settles it, and without a club the surname must leave only one candidate.
    const first = key.split(' ')[0];
    if (!key.includes(' ')) {
      return { kind: 'not-found' };
    }
    const shortened = (this.byLastName.get(lastName(key)) ?? []).filter((player) => {
      const poolFirst = nameKey(player.name).split(' ')[0];
      return poolFirst.startsWith(first) || first.startsWith(poolFirst);
    });
    const onClub = sheetTeam
      ? shortened.filter((player) => teamKey(player.teamAbbrev) === sheetTeam)
      : [];
    if (onClub.length === 1) {
      return { kind: 'matched', player: onClub[0] };
    }
    if (shortened.length === 1) {
      return { kind: 'matched', player: shortened[0] };
    }
    if (shortened.length > 1) {
      return { kind: 'ambiguous', candidates: shortened };
    }
    return { kind: 'not-found' };
  }

  /**
   * How many of these cells name a pool player. The name column is found by this when its heading
   * does not say so, which is common: a sheet's first column is often headed by a merged cell above.
   */
  countMatches(cells: Cell[]): number {
    return cells.filter((cell) => typeof cell === 'string' && this.byName.has(nameKey(cell)))
      .length;
  }
}

function pick(candidates: Player[], team: string | null): MatchResult {
  if (candidates.length === 1) {
    return { kind: 'matched', player: candidates[0] };
  }
  const sameClub = team ? candidates.filter((p) => teamKey(p.teamAbbrev) === team) : [];
  return sameClub.length === 1
    ? { kind: 'matched', player: sameClub[0] }
    : { kind: 'ambiguous', candidates };
}

function push(map: Map<string, Player[]>, key: string, player: Player): void {
  const list = map.get(key);
  if (list) {
    list.push(player);
  } else {
    map.set(key, [player]);
  }
}
