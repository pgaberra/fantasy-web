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
 * positions who play the same night are interchangeable, so each kind is worked out once. A drop
 * who does not play that night, or sits on the bench anyway, opens nothing, and positions already
 * open without a drop are left out: they are the night's own room.
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
    const openings: DropOpening[] = [];
    for (const [key, kind] of [...kinds].sort(([, a], [, b]) => lineupOrder(a.order, b.order))) {
      const rest = playing
        .filter((player) => player !== kind.drop)
        .map((player) => player.positions);
      const filled = seated(rest, seats);
      const opens = LINEUP_POSITIONS.filter(
        (position) => !room.fits.has(position) && seated([...rest, [position]], seats) > filled,
      );
      openings.push({ kind: key, names: kind.names, opens });
    }
    if (openings.some((opening) => opening.opens.length > 0)) {
      opened.set(date, openings);
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
 * One kind of drop on a night: the positions the dropped player is eligible at ("LW", "C/LW"),
 * the user's players of that kind who play that night, and the positions a pickup would then
 * start at, none if dropping him opens nothing.
 */
export interface DropOpening {
  readonly kind: string;
  readonly names: readonly string[];
  readonly opens: readonly LineupPosition[];
}

/**
 * A night's positions open only through a drop, one entry per kind of the user's players who play
 * that night, those whose drop opens nothing included, so a tip can tell who would not do.
 */
export type DropRoom = readonly DropOpening[];

/** The kinds of player whose drop opens a position, in lineup order: "C/LW, LW". */
function dropKinds(room: DropRoom | undefined, position: LineupPosition): string[] {
  return (room ?? [])
    .filter((opening) => opening.opens.includes(position))
    .map((opening) => opening.kind);
}

/**
 * Who has to go for a yellow run's positions to open, for its tooltip. Every position in a run is
 * opened by the same drops, so the tip is one rule, and the pill already names the spot, so the
 * tip says only who: "Drop any forward.", "Drop a C or LW.", "Drop a LW, except Brady Tkachuk."
 *
 * <p>The players are named in groups ("any forward", "any skater") and positions ("a LW"), and
 * the wording chosen covers everyone whose drop frees the spot while taking in as few players
 * who would not as it can, those few named as exceptions; then the fewest words, then the
 * shortest. "A C", not "any forward", when every forward is a C.
 */
export function dropRoomTip(room: DropRoom, positions: readonly LineupPosition[]): string {
  const freeing = new Set(dropKinds(room, positions[0]));
  const at = (kind: string) => kind.split('/');
  const skaters = room.filter((opening) => !at(opening.kind).includes('G'));
  const forwards = skaters.filter((opening) => !at(opening.kind).includes('D'));
  /** Every way to name some of the night's players, those that name nobody who would do left out. */
  const terms = [
    ...(skaters.length > forwards.length ? [{ group: true, word: 'skater', takes: skaters }] : []),
    { group: true, word: 'forward', takes: forwards },
    ...LINEUP_POSITIONS.map((position) => ({
      group: false,
      word: position,
      takes: room.filter((opening) => at(opening.kind).includes(position)),
    })),
  ].filter(({ takes }) => takes.some((opening) => freeing.has(opening.kind)));
  let best: { misses: number; words: number; text: string } | undefined;
  for (let mask = 1; mask < 1 << terms.length; mask++) {
    const chosen = terms.filter((_, index) => mask & (1 << index));
    const taken = new Set(chosen.flatMap(({ takes }) => takes));
    if (![...freeing].every((kind) => [...taken].some((opening) => opening.kind === kind))) {
      continue;
    }
    const misses = [...taken]
      .filter((opening) => !freeing.has(opening.kind))
      .flatMap((opening) => opening.names);
    const named = chosen.filter(({ group }) => !group).map(({ word }) => word);
    const drops = [
      ...chosen.filter(({ group }) => group).map(({ word }) => `any ${word}`),
      ...(named.length > 0 ? [`a ${join(named, 'or')}`] : []),
    ];
    const except = misses.length > 0 ? `, except ${join(misses, 'and')}` : '';
    const candidate = {
      misses: misses.length,
      words: chosen.length,
      text: `Drop ${drops.join(' or ')}${except}.`,
    };
    if (
      !best ||
      (candidate.misses - best.misses ||
        candidate.words - best.words ||
        candidate.text.length - best.text.length) < 0
    ) {
      best = candidate;
    }
  }
  return best?.text ?? '';
}

function join(words: readonly string[], last: 'or' | 'and'): string {
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`;
}

/** A stretch of a night's positions side by side, all open as the lineup stands or all only through a drop. */
export interface RoomRun {
  readonly drop: boolean;
  readonly positions: readonly LineupPosition[];
}

/**
 * A night's open positions, its own and a drop's together, always in lineup order (C, LW, RW, D,
 * G) and cut into runs wherever they switch between the two, so the cell never reorders them by
 * where the room comes from. A drop's positions are cut again wherever different drops open
 * them, so each yellow run has one rule to tell. A full night with nothing a drop opens has no
 * runs.
 */
export function roomRuns(room: NightRoom | undefined, dropRoom: DropRoom | undefined): RoomRun[] {
  const runs: { drop: boolean; drops: string; positions: LineupPosition[] }[] = [];
  for (const position of LINEUP_POSITIONS) {
    const own = !!room?.fits.has(position);
    const drops = own ? '' : dropKinds(dropRoom, position).join(',');
    if (!own && !drops) {
      continue;
    }
    const last = runs.at(-1);
    if (last && last.drop === !own && last.drops === drops) {
      last.positions.push(position);
    } else {
      runs.push({ drop: !own, drops, positions: [position] });
    }
  }
  return runs.map(({ drop, positions }) => ({ drop, positions }));
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
