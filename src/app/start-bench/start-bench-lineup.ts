import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { ScheduledGame } from '../api/models/scheduled-game';
import { TeamSchedule } from '../api/models/team-schedule';
import { TeamRow, teamRoom } from '../fa-scout/drop-candidates';
import { nhlTeamKey } from '../models/nhl-team';
import { TeamPlayer } from '../services/fa-scout.service';
import { labelledSeats, LabelledSeat } from '../streamer-planner/planner-lineup';

/**
 * The chance of dressing at which the model's word that a skater plays tonight outweighs a
 * platform that still has him out: a player cleared after the platform last looked, as Bedard was
 * on 2026-10-13, still parked on IR+. Below it he is a game-time call, and the platform stands.
 */
export const DRESSES_TONIGHT = 0.5;

/** Slots that hold a player out of the lineup and off the roster count: IR and not-active. */
const RESERVE_SLOTS = new Set(['IR', 'IR+', 'IR-LT', 'IR-NR', 'NA']);
/** The bench, as Yahoo and ESPN spell it. */
const BENCH_SLOTS = new Set(['BN', 'BE', 'BENCH']);

/** Where a player sits in the lineup as the platform has it set for the day. */
export type NowStatus = 'lineup' | 'bench' | 'reserve';

/** What the suggestion asks of the manager for one player: nothing, or one move. */
export type Change = 'start' | 'bench' | null;

/** One of the user's players on the day, as the page lists him. */
export interface StartBenchRow {
  readonly player: PlannerRosterPlayer;
  /** His club's game that day; null when it has none, or the schedule does not know his club. */
  readonly game: ScheduledGame | null;
  /** The model's line for the day scored by the league's settings; null when it has none. */
  readonly score: number | null;
  /** The share of his club's game he is expected to dress for, or to start for a goalie. */
  readonly expectedGames: number | null;
  /** The slot the platform has him in, and what that slot is. */
  readonly nowSlot: string | null;
  readonly now: NowStatus;
  /** The slot the best lineup puts him in, or null for the bench. */
  readonly suggested: string | null;
  readonly change: Change;
  /**
   * Started from injured reserve or not-active: he has to be activated first, which takes a
   * roster spot ({@link makeRoom}).
   */
  readonly activate: boolean;
  /**
   * The platform has him out, but the model expects him to play tonight: the two disagree, and the
   * row says so rather than pick one silently.
   */
  readonly clearedByModel: boolean;
}

/** The day's lineup: every player, and what the suggestion changes. */
export interface StartBenchDay {
  readonly rows: readonly StartBenchRow[];
  /** Lineup seats the league has, and the players with a game who can fill one. */
  readonly spots: number;
  readonly playing: number;
  /** The players the suggestion starts who sit out now, and the ones it sits who start now. */
  readonly starts: readonly StartBenchRow[];
  readonly benches: readonly StartBenchRow[];
  /** The starts that come off injured reserve or not-active, each needing a roster spot. */
  readonly activations: readonly StartBenchRow[];
  /**
   * What the suggested lineup scores over the one set now, in the league's own score: fantasy
   * points in a points league. Null where a player's line is missing on either side, since the
   * difference would then be a guess.
   */
  readonly gain: number | null;
}

/**
 * Whether a player can play tonight: not out on the platform, or out there while the model expects
 * him to play. A skater counts from {@link DRESSES_TONIGHT}; a goalie's chance is his share of the
 * crease, nought while he is out, so any share at all says he is back.
 */
export function playsTonight(
  player: PlannerRosterPlayer,
  expectedGames: number | undefined,
): boolean {
  if (!player.out) {
    return true;
  }
  if (expectedGames === undefined) {
    return false;
  }
  return player.type === 'goalie' ? expectedGames > 0 : expectedGames >= DRESSES_TONIGHT;
}

export function nowStatus(slot: string | null | undefined): NowStatus {
  const key = slot?.toUpperCase() ?? '';
  if (RESERVE_SLOTS.has(key)) {
    return 'reserve';
  }
  return !key || BENCH_SLOTS.has(key) ? 'bench' : 'lineup';
}

/**
 * The best lineup for a day: of the players whose club plays and who are not out, the ones the
 * model expects the most from are seated first, each moved about to make room for the next (a C/LW
 * goes wherever leaves a seat for the others), so the players left standing are the ones a manager
 * would bench. Players level on the model keep the one already starting, so the suggestion never
 * swaps two players for nothing. A player the model has no line for still takes a seat that would
 * otherwise go empty, after everyone it has a line for.
 *
 * @param scores the model's line for the day, scored by the league's settings, by player id
 * @param expected the share of his club's game each player is expected to play, by player id
 */
export function startBenchDay(
  roster: readonly PlannerRosterPlayer[],
  slots: RosterSlots,
  teams: ReadonlyMap<string, TeamSchedule>,
  date: string,
  scores: ReadonlyMap<string, number>,
  expected: ReadonlyMap<string, number>,
): StartBenchDay {
  const seats = labelledSeats(slots);
  const gameOf = (player: PlannerRosterPlayer) =>
    teams.get(nhlTeamKey(player.teamAbbrev) ?? '')?.schedule.find((game) => game.date === date) ??
    null;
  const candidates = roster
    .map((player, index) => ({ player, index, game: gameOf(player) }))
    .filter(
      ({ player, game }) =>
        playsTonight(player, expected.get(player.playerId)) &&
        player.positions.length > 0 &&
        game !== null,
    )
    .sort((a, b) => {
      const scoreA = scores.get(a.player.playerId);
      const scoreB = scores.get(b.player.playerId);
      if ((scoreA === undefined) !== (scoreB === undefined)) {
        return scoreA === undefined ? 1 : -1;
      }
      return (
        (scoreB ?? 0) - (scoreA ?? 0) ||
        Number(nowStatus(b.player.slot) === 'lineup') -
          Number(nowStatus(a.player.slot) === 'lineup') ||
        a.index - b.index
      );
    });
  const seatOf = assignSeats(
    candidates.map(({ player }) => player.positions),
    seats,
  );
  const suggested = new Map<string, string>();
  candidates.forEach(({ player }, index) => {
    const seat = seatOf[index];
    if (seat !== null) {
      suggested.set(player.playerId, seats[seat].label);
    }
  });

  const rows = roster.map((player): StartBenchRow => {
    const now = nowStatus(player.slot);
    const slot = suggested.get(player.playerId) ?? null;
    const game = gameOf(player);
    // A starter with no game, or out, gives nothing where he sits: moving him is no decision, and
    // a start that needs his seat takes it on the platform. Only a player who would play is sat.
    const available = playsTonight(player, expected.get(player.playerId));
    const plays = game !== null && available;
    let change: Change = null;
    if (now !== 'lineup' && slot !== null) {
      change = 'start';
    } else if (now === 'lineup' && slot === null && plays) {
      change = 'bench';
    }
    return {
      player,
      game,
      score: scores.get(player.playerId) ?? null,
      expectedGames: expected.get(player.playerId) ?? null,
      nowSlot: player.slot ?? null,
      now,
      suggested: slot,
      change,
      activate: change === 'start' && now === 'reserve',
      clearedByModel: player.out && available,
    };
  });
  const starts = rows.filter((row) => row.change === 'start');
  const benches = rows.filter((row) => row.change === 'bench');
  return {
    rows,
    spots: seats.length,
    playing: candidates.length,
    starts,
    benches,
    activations: starts.filter((row) => row.activate),
    gain: gain(starts, benches),
  };
}

/** How the roster makes a spot for each player activated from injured reserve. */
export interface Room {
  /** Spots nobody holds once they are activated. */
  readonly openSpots: number;
  /** Injured players to move into the reserve slots the activated leave free, each freeing a spot. */
  readonly toReserve: readonly TeamPlayer[];
  /** The players to drop for the rest, the one the team loses least by first. */
  readonly drops: readonly TeamRow[];
  /** Spots still short: more activations than the roster can make room for with these. */
  readonly short: number;
}

/**
 * Room for the activations, the cheapest way first: a spot nobody holds, then an injured player
 * moved into the reserve slot an activated player leaves free, then a drop. The drop is the player
 * the team loses least by over the rest of the season, as FA Scout ranks a team (`scores`), among
 * those who neither start tonight in the suggestion nor sit on reserve, so the drop costs nothing
 * tonight and frees a spot that counts. A player the model has no rest-of-season line for is not
 * named: there is nothing to say he is the cheapest.
 *
 * @param team the user's players with their rest of the season, as `/start-bench/rest-of-season` reads them
 * @param scores each one's rest of the season scored by the league's settings, by player id
 * @param reserveSlots the league's injured-reserve slots by code ({@code IR: 2})
 */
export function makeRoom(
  day: StartBenchDay,
  team: readonly TeamPlayer[],
  scores: ReadonlyMap<string, number>,
  slots: RosterSlots,
  reserveSlots: Readonly<Record<string, number>>,
): Room {
  if (day.activations.length === 0) {
    return { openSpots: 0, toReserve: [], drops: [], short: 0 };
  }
  const activated = new Set(day.activations.map((row) => row.player.playerId));
  // As the roster stands once they are activated: on the bench, holding a spot, their reserve
  // slots free for someone else.
  const after = team.map((player) =>
    activated.has(player.playerId) ? { ...player, slot: 'BN', reserve: false, out: false } : player,
  );
  const held = after.filter((player) => !player.reserve).length;
  const capacity = labelledSeats(slots).length + (slots.bn ?? 0);
  const openSpots = Math.max(0, capacity - (held - activated.size));
  let needed = Math.max(0, activated.size - openSpots);
  const toReserve = teamRoom(after, slots, reserveSlots)
    .toReserve.slice(0, needed)
    .map((move) => move.player);
  needed -= toReserve.length;

  const startingTonight = new Set(
    day.rows.filter((row) => row.suggested !== null).map((row) => row.player.playerId),
  );
  const moved = new Set(toReserve.map((player) => player.playerId));
  const drops = team
    .filter(
      (player) =>
        !player.reserve &&
        !activated.has(player.playerId) &&
        !startingTonight.has(player.playerId) &&
        !moved.has(player.playerId) &&
        scores.has(player.playerId),
    )
    .map((player) => ({ player, score: scores.get(player.playerId) ?? 0 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, needed);
  return {
    openSpots: Math.min(openSpots, activated.size),
    toReserve,
    drops,
    short: needed - drops.length,
  };
}

/** What the moves add up to: the starts' lines less the lines of the players they sit. */
function gain(starts: readonly StartBenchRow[], benches: readonly StartBenchRow[]): number | null {
  let total = 0;
  for (const row of [...starts, ...benches]) {
    if (row.score === null) {
      return null;
    }
    total += row.change === 'start' ? row.score : -row.score;
  }
  return total;
}

/**
 * The seat each player sits in, taken in the order listed: each is seated if a seat can be found
 * for him, with the players already seated moved about to make one, and never unseated, as
 * `seating` in the planner does. Seats are tried in the league's order, the narrow slots first, so
 * a C sits at C before Util.
 */
export function assignSeats(
  players: readonly (readonly string[])[],
  seats: readonly LabelledSeat[],
): readonly (number | null)[] {
  const owner: number[] = seats.map(() => -1);
  const place = (player: number, tried: boolean[]): boolean => {
    // An empty seat first, so a player is moved only when nothing is free: the better player keeps
    // his C seat and the one after him takes Util, rather than the other way about.
    const free = seats.findIndex(
      ({ takes }, seat) =>
        owner[seat] === -1 && !tried[seat] && players[player].some((p) => takes.has(p)),
    );
    if (free !== -1) {
      owner[free] = player;
      return true;
    }
    for (const [seat, { takes }] of seats.entries()) {
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
  players.forEach((_, player) =>
    place(
      player,
      seats.map(() => false),
    ),
  );
  const seatOf: (number | null)[] = players.map(() => null);
  owner.forEach((player, seat) => {
    if (player !== -1) {
      seatOf[player] = seat;
    }
  });
  return seatOf;
}

/** The order the page lists the lineup in: as the platform has it set, seat by seat. */
const SLOT_ORDER = ['C', 'LW', 'RW', 'W', 'F', 'D', 'UTIL', 'G'];

/**
 * The rows as the lineup reads now: the players starting, slot by slot, then the bench, then
 * injured reserve. Within a group the model's best first.
 */
export function byLineupNow(rows: readonly StartBenchRow[]): StartBenchRow[] {
  const group = (row: StartBenchRow) => ['lineup', 'bench', 'reserve'].indexOf(row.now);
  const slot = (row: StartBenchRow) => {
    const index = SLOT_ORDER.indexOf(row.nowSlot?.toUpperCase() ?? '');
    return index === -1 ? SLOT_ORDER.length : index;
  };
  return [...rows].sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.now === 'lineup' ? slot(a) - slot(b) : 0) ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );
}

/** "vs BOS", "@ TOR": the game from the player's side. */
export function gameLabel(game: ScheduledGame): string {
  const opponent = game.opponent ?? 'TBD';
  return game.home ? `vs ${opponent}` : `@ ${opponent}`;
}
