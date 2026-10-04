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
  const active = roster
    .filter((player) => !player.out && player.positions.length > 0)
    .map((player) => ({
      positions: player.positions,
      nights: new Set(
        teams.get(nhlTeamKey(player.teamAbbrev) ?? '')?.schedule.map((game) => game.date) ?? [],
      ),
    }));
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

/** Whether a player at these positions would start on a night with this room. */
export function fitsRoom(positions: readonly string[], room: NightRoom | undefined): boolean {
  return !!room && positions.some((position) => room.fits.has(position as LineupPosition));
}

/** "D", "C, LW", "Any skater", "Any skater, G": who would start that night, for the day's cell. */
export function roomLabel(room: NightRoom): string {
  if (room.fits.size === 0) {
    return 'Full';
  }
  const anySkater = SKATER_POSITIONS.every((position) => room.fits.has(position));
  const named = anySkater
    ? ['Any skater', ...(room.fits.has('G') ? ['G'] : [])]
    : LINEUP_POSITIONS.filter((position) => room.fits.has(position));
  return named.join(', ');
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
