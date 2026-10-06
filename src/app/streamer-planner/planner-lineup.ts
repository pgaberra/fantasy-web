import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamSchedule } from '../api/models/team-schedule';
import { nhlTeamKey } from '../models/nhl-team';

/** The positions a lineup slot is filled by. */
export type LineupPosition = 'C' | 'LW' | 'RW' | 'D' | 'G';

/** In the order a lineup lists them. */
export const LINEUP_POSITIONS: readonly LineupPosition[] = ['C', 'LW', 'RW', 'D', 'G'];

const SKATER_POSITIONS: readonly LineupPosition[] = ['C', 'LW', 'RW', 'D'];

/**
 * Which positions each of the league's lineup slots takes. The bench is not a lineup slot: a
 * player there scores nothing, which is the whole question the planner asks.
 */
const SLOT_TAKES: Readonly<Record<Exclude<keyof RosterSlots, 'bn'>, readonly LineupPosition[]>> = {
  c: ['C'],
  lw: ['LW'],
  rw: ['RW'],
  w: ['LW', 'RW'],
  f: ['C', 'LW', 'RW'],
  d: ['D'],
  util: SKATER_POSITIONS,
  g: ['G'],
};

/** One seat in the lineup: the positions that may sit in it. */
type Seat = ReadonlySet<string>;

/** Every lineup seat the league has, one per slot it counts. */
export function lineupSeats(slots: RosterSlots): readonly Seat[] {
  const seats: Seat[] = [];
  for (const [slot, takes] of Object.entries(SLOT_TAKES)) {
    const count = slots[slot as keyof RosterSlots] ?? 0;
    for (let index = 0; index < count; index++) {
      seats.push(new Set(takes));
    }
  }
  return seats;
}

/**
 * The most of these players the seats can hold at once, each seated at a position he may play.
 * A player eligible at C and LW is moved to whichever seat leaves room for the others, as a
 * manager would set the lineup, so the answer does not depend on the order he is listed in.
 * Rosters and lineups are a couple of dozen at most, so plain augmenting paths are plenty.
 */
export function seated(players: readonly (readonly string[])[], seats: readonly Seat[]): number {
  const owner: number[] = seats.map(() => -1);
  const place = (player: number, tried: boolean[]): boolean => {
    for (const [seat, takes] of seats.entries()) {
      if (tried[seat] || !players[player].some((position) => takes.has(position))) {
        continue;
      }
      tried[seat] = true;
      if (owner[seat] === -1 || place(owner[seat], tried)) {
        owner[seat] = player;
        return true;
      }
    }
    return false;
  };
  let count = 0;
  for (const player of players.keys()) {
    if (
      place(
        player,
        seats.map(() => false),
      )
    ) {
      count++;
    }
  }
  return count;
}

/** How a night looks from the user's own lineup. */
export interface NightRoom {
  readonly date: string;
  /** His players who play that night: on a club with a game, and not out. */
  readonly playing: number;
  /** Lineup seats left empty once they are all seated. */
  readonly open: number;
  /** Playing, but with no seat left for them: on the bench. */
  readonly benched: number;
  /**
   * The positions a player added that night would start at, so fill one more seat. A player fits
   * the night when any of his positions is in here.
   */
  readonly fits: ReadonlySet<LineupPosition>;
}

/**
 * Each date's room in the user's lineup. A player plays on a date his club has a game, unless he is
 * out; one on a club the schedule does not know never plays, since nothing says when he would.
 */
export function nightRooms(
  roster: readonly PlannerRosterPlayer[],
  slots: RosterSlots,
  teams: ReadonlyMap<string, TeamSchedule>,
  dates: readonly string[],
): ReadonlyMap<string, NightRoom> {
  const seats = lineupSeats(slots);
  const active = activePlayers(roster, teams);
  const rooms = new Map<string, NightRoom>();
  for (const date of dates) {
    const playing = active
      .filter((player) => player.nights.has(date))
      .map((player) => player.positions);
    const filled = seated(playing, seats);
    const fits = new Set<LineupPosition>(
      filled === seats.length
        ? []
        : LINEUP_POSITIONS.filter((position) => seated([...playing, [position]], seats) > filled),
    );
    rooms.set(date, {
      date,
      playing: playing.length,
      open: seats.length - filled,
      benched: playing.length - filled,
      fits,
    });
  }
  return rooms;
}

/** The players who can start, each with the dates his club plays. */
function activePlayers(
  roster: readonly PlannerRosterPlayer[],
  teams: ReadonlyMap<string, TeamSchedule>,
) {
  return roster
    .filter((player) => !player.out && player.positions.length > 0)
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      positions: player.positions,
      nights: new Set(
        teams.get(nhlTeamKey(player.teamAbbrev) ?? '')?.schedule.map((game) => game.date) ?? [],
      ),
    }));
}

/**
 * What a drop would open on each night: for every kind of player the user could drop, by the
 * positions he is eligible at, the positions a pickup would then start at. A drop frees his seat
 * the nights he plays and starts, and with players eligible at two positions moved about, that
 * seat can take more than his own position: dropping a LW whose C/LW teammate can slide over makes
 * room for a C as well, while dropping that C/LW may open only the C. Players eligible at the same
 * positions who play the same night are interchangeable, so each kind is worked out once; kinds
 * that open the same positions are listed together. A drop who does not play that night, or sits
 * on the bench anyway, opens nothing, and positions already open without a drop are left out:
 * they are the night's own room.
 *
 * @param rooms each date's room as the roster stands ({@link nightRooms})
 */
export function dropRooms(
  roster: readonly PlannerRosterPlayer[],
  slots: RosterSlots,
  teams: ReadonlyMap<string, TeamSchedule>,
  rooms: ReadonlyMap<string, NightRoom>,
): ReadonlyMap<string, DropRoom> {
  const seats = lineupSeats(slots);
  const active = activePlayers(roster, teams);
  const opened = new Map<string, DropRoom>();
  for (const [date, room] of rooms) {
    const playing = active.filter((player) => player.nights.has(date));
    const kinds = new Map<
      string,
      { order: number[]; drop: (typeof playing)[number]; names: string[] }
    >();
    for (const player of playing) {
      const positions = LINEUP_POSITIONS.filter((position) => player.positions.includes(position));
      const key = positions.join('/');
      if (key) {
        const order = positions.map((position) => LINEUP_POSITIONS.indexOf(position));
        const kind = kinds.get(key) ?? { order, drop: player, names: [] };
        kind.names.push(player.name);
        kinds.set(key, kind);
      }
    }
    // Kinds that open the same positions, keyed by those positions, in the order first found.
    const byOpens = new Map<
      string,
      { kinds: string[]; names: string[]; opens: LineupPosition[] }
    >();
    for (const [key, kind] of [...kinds].sort(([, a], [, b]) => lineupOrder(a.order, b.order))) {
      const rest = playing
        .filter((player) => player !== kind.drop)
        .map((player) => player.positions);
      const filled = seated(rest, seats);
      const opens = LINEUP_POSITIONS.filter(
        (position) => !room.fits.has(position) && seated([...rest, [position]], seats) > filled,
      );
      if (opens.length > 0) {
        const same = byOpens.get(opens.join(','));
        if (same) {
          same.kinds.push(key);
          same.names.push(...kind.names);
        } else {
          byOpens.set(opens.join(','), { kinds: [key], names: [...kind.names], opens });
        }
      }
    }
    if (byOpens.size > 0) {
      opened.set(date, [...byOpens.values()]);
    }
  }
  return opened;
}

/** Kinds of drop in lineup order, by their positions' places in it: C, then C/LW, then LW. */
function lineupOrder(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return a.length - b.length;
}

/**
 * One line of a night's drop room: the kinds of player whose drop opens it ("LW", "C/LW"), the
 * players of those kinds who play that night, and the positions a pickup would then start at.
 */
export interface DropOpening {
  readonly kinds: readonly string[];
  readonly names: readonly string[];
  readonly opens: readonly LineupPosition[];
}

/** A night's positions open only through a drop, one line per kind of drop. */
export type DropRoom = readonly DropOpening[];

/** "LW → C, LW, RW": a drop line as the day's cell shows it. */
export function dropOpeningLabel(opening: DropOpening): string {
  return `${opening.kinds.join(', ')} \u2192 ${opening.opens.join(', ')}`;
}

/** Who that drop is and what it opens, said in full, for the line's tooltip. */
export function dropOpeningTip(opening: DropOpening): string {
  return `Drop ${joinNames(opening.names)} (${opening.kinds.join(' or ')}): room for ${joinNames(opening.opens)}.`;
}

function joinNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** Whether a player at these positions would start on a night with this room. */
export function fitsRoom(positions: readonly string[], room: NightRoom | undefined): boolean {
  return !!room && positions.some((position) => room.fits.has(position as LineupPosition));
}

/** "D", "C, LW", "C, LW, RW, D, G": who would start that night, for the day's cell. */
export function roomLabel(room: NightRoom): string {
  if (room.fits.size === 0) {
    return 'Full';
  }
  return positionsLabel(room.fits);
}

/**
 * Positions as a cell names them, each by its own name in lineup order: five at most, and named
 * outright they need no reading, where "Any skater" left the reader to work out what it covered.
 */
function positionsLabel(positions: ReadonlySet<LineupPosition>): string {
  return LINEUP_POSITIONS.filter((position) => positions.has(position)).join(', ');
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The day's room said in full, for its tooltip. */
export function roomTip(room: NightRoom): string {
  const playing = `${plural(room.playing, 'of your players plays', 'of your players play')}`;
  if (room.fits.size === 0) {
    const bench = room.benched > 0 ? `, ${room.benched} on the bench` : '';
    return `Your lineup is full: ${playing}${bench}.`;
  }
  return `${playing}, ${plural(room.open, 'slot', 'slots')} open. Room for: ${roomLabel(room)}.`;
}
