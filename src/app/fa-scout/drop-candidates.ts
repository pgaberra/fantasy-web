import { RosterSlots } from '../api/models/roster-slots';
import { Projection, ScoredProjection } from '../models/projection.model';
import { TeamPlayer } from '../services/fa-scout.service';
import {
  LINEUP_POSITIONS,
  LineupPosition,
  lineupSeats,
  seated,
} from '../streamer-planner/planner-lineup';
import { ScoutKind } from './scout-ranking';

/** One of the user's own players, scored on the same scale as the wire. */
export interface TeamRow {
  readonly player: TeamPlayer;
  /** His rest of the season scored by the league's settings; null when the model has no line. */
  readonly score: number | null;
}

/** An injured player to move to a free injured-reserve slot, and which slot. */
export interface ReserveMove {
  readonly player: TeamPlayer;
  /** The slot, in the platform's spelling: IR, IR+, IR-LT or IR-NR. */
  readonly slot: string;
}

/** The room the user's roster has for a pickup without dropping anyone. */
export interface TeamRoom {
  /** Roster spots nobody holds: fewer players off reserve than the league's lineup and bench. */
  readonly openSpots: number;
  /** Injured players who can go to a free injured-reserve slot, the one most worth keeping first. */
  readonly toReserve: readonly ReserveMove[];
}

/** No room: a full roster, nobody to move. */
export const NO_ROOM: TeamRoom = { openSpots: 0, toReserve: [] };

/**
 * A pickup's best move, and what the team gains by it: into an open roster spot, into the spot an
 * injured player leaves for injured reserve, or in place of a player dropped. The first two cost
 * nobody, so the gain is the pickup's whole score.
 */
export type Swap =
  | { readonly kind: 'open'; readonly gain: number }
  | { readonly kind: 'reserve'; readonly move: ReserveMove; readonly gain: number }
  | {
      readonly kind: 'drop';
      readonly drop: TeamRow;
      /** The pickup's score less the dropped player's: positive is an upgrade. */
      readonly gain: number;
    };

/** One of the user's players as a candidate to drop, and what the lineup needs of his pickup. */
export interface DropCandidate {
  readonly row: TeamRow;
  /** Whether any pickup of his kind keeps the lineup as full: a skater at any position, a goalie. */
  readonly anyPickup: boolean;
  /**
   * The positions a pickup of his kind must play for the lineup to stay as full as it is; empty
   * when any will do. A team with only as many D as it starts can drop its worst D only for
   * another D.
   */
  readonly needs: readonly LineupPosition[];
}

/** Drop candidates shown: the two or three a manager weighs before every pickup. */
export const DROP_CANDIDATES_SHOWN = 3;

/** One lineup seat: the positions that may sit in it, as the planner's lineup builds them. */
type Seat = ReadonlySet<string>;

/**
 * The user's own players of one kind, scored in one pool with the wire's lines so the scores are
 * comparable: a category league scores a line against the pool it is ranked in.
 *
 * @param wire the available players' rest-of-season lines of every kind; only `kind` is pooled
 */
export function scoreTeam(
  team: readonly TeamPlayer[],
  wire: readonly Projection[],
  kind: ScoutKind,
  rank: (projections: Projection[]) => ScoredProjection[],
  scoreOf: (entry: ScoredProjection) => number,
): TeamRow[] {
  const own = team.filter((player) => player.type === kind);
  const lines = own.flatMap((player) => (player.projection ? [player.projection] : []));
  const scores = new Map<number, number>();
  if (lines.length > 0) {
    const ownKeys = new Set(lines.map((line) => line.playerId));
    for (const entry of rank([...wire.filter((line) => line.type === kind), ...lines])) {
      if (ownKeys.has(entry.projection.playerId)) {
        scores.set(entry.projection.playerId, scoreOf(entry));
      }
    }
  }
  return own.map((player) => ({
    player,
    score: player.projection ? (scores.get(player.projection.playerId) ?? null) : null,
  }));
}

/** Whether a player the platform lets into `eligible` may take a free slot of this code. */
function fitsReserve(eligible: readonly string[], slot: string): boolean {
  // Yahoo's IR+ takes everyone its IR takes and more besides: out players, too.
  return eligible.includes(slot) || (slot === 'IR+' && eligible.includes('IR'));
}

/**
 * The room the user's roster has without a drop. Open spots are the league's lineup and bench
 * less every player who is not on reserve; with the league's slots unknown, none is assumed. An
 * injured player may move to injured reserve when he is out, the platform lets him in
 * (`reserveEligible`) and a slot he fits is free. When there are more such players than slots,
 * the ones with the most games left are moved: they are the ones worth keeping.
 *
 * @param reserveSlots the league's injured-reserve slots by code ({@code IR: 2}); not-active is not one
 */
export function teamRoom(
  team: readonly TeamPlayer[],
  slots: RosterSlots | null,
  reserveSlots: Readonly<Record<string, number>>,
): TeamRoom {
  const held = team.filter((player) => !player.reserve).length;
  const openSpots = slots ? Math.max(0, lineupSeats(slots).length + slots.bn - held) : 0;

  const free = new Map<string, number>();
  for (const [slot, count] of Object.entries(reserveSlots)) {
    const taken = team.filter((player) => player.slot?.toUpperCase() === slot).length;
    if (count > taken) {
      free.set(slot, count - taken);
    }
  }
  const injured = team
    .filter((player) => player.out && !player.reserve && player.reserveEligible.length > 0)
    .sort((a, b) => (b.projection?.stats.utility.gp ?? 0) - (a.projection?.stats.utility.gp ?? 0));
  const toReserve: ReserveMove[] = [];
  for (const player of injured) {
    // The narrowest slot he fits first, leaving IR+ for the players only it takes.
    const slot = [...free.keys()]
      .filter((code) => (free.get(code) ?? 0) > 0 && fitsReserve(player.reserveEligible, code))
      .sort((a, b) => Number(a === 'IR+') - Number(b === 'IR+'))[0];
    if (slot) {
      free.set(slot, (free.get(slot) ?? 0) - 1);
      toReserve.push({ player, slot });
    }
  }
  return { openSpots, toReserve };
}

/** The players who can be started now: not out, and eligible somewhere. */
function startable(team: readonly TeamRow[]): TeamRow[] {
  return team.filter((row) => !row.player.out && row.player.positions.length > 0);
}

function positionsOf(rows: readonly TeamRow[]): string[][] {
  return rows.map((row) => [...row.player.positions]);
}

/**
 * Whether dropping `drop` for a player at `pickup` leaves the lineup at least as full as it is:
 * as many seats filled, with every player placed where he may start. A team already short of a
 * position is not held to more than it has.
 */
function keepsLineup(
  team: readonly TeamRow[],
  drop: TeamRow,
  pickup: readonly string[],
  seats: readonly Seat[],
): boolean {
  const active = startable(team);
  const before = seated(positionsOf(active), seats);
  const after = seated([...positionsOf(active.filter((row) => row !== drop)), [...pickup]], seats);
  return after >= before;
}

/**
 * The players who could be dropped to make room: every one on the roster but those on injured
 * reserve, who hold no roster spot, those about to move there instead, and those the model has no
 * line for, whose loss cannot be weighed. Lowest score first.
 */
function droppable(team: readonly TeamRow[], room: TeamRoom): TeamRow[] {
  const moving = new Set(room.toReserve.map((move) => move.player));
  return team
    .filter((row) => !row.player.reserve && !moving.has(row.player) && row.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

/**
 * A pickup's best move. An open roster spot first, then the spot an injured player leaves for
 * injured reserve: neither costs anyone. Otherwise the drop of the same kind: the lowest scorer
 * whose loss leaves the lineup as full as it is with the pickup in it. Null when no player can go
 * without emptying a seat, or the team has nobody of the kind to drop.
 *
 * @param pickup the pickup's positions and score, scored in the same pool as `team`
 * @param seats every lineup seat the league has ({@link lineupSeats}); none checks no positions
 */
export function bestSwap(
  pickup: { readonly positions: readonly string[]; readonly score: number },
  team: readonly TeamRow[],
  seats: readonly Seat[],
  room: TeamRoom = NO_ROOM,
): Swap | null {
  if (room.openSpots > 0) {
    return { kind: 'open', gain: pickup.score };
  }
  if (room.toReserve.length > 0) {
    return { kind: 'reserve', move: room.toReserve[0], gain: pickup.score };
  }
  const drop = droppable(team, room).find((row) => keepsLineup(team, row, pickup.positions, seats));
  return drop ? { kind: 'drop', drop, gain: pickup.score - (drop.score ?? 0) } : null;
}

/**
 * The user's players most worth dropping, lowest score first, each with the positions a pickup
 * must play for the lineup to stay as full. A player is still listed when only a like-for-like
 * pickup can replace him: he is the one to drop for that pickup. A player moving to injured
 * reserve is not one.
 */
export function dropCandidates(
  team: readonly TeamRow[],
  seats: readonly Seat[],
  room: TeamRoom = NO_ROOM,
  shown = DROP_CANDIDATES_SHOWN,
): DropCandidate[] {
  return droppable(team, room)
    .slice(0, shown)
    .map((row) => {
      // A pickup of his own kind: a skater's seat refilled by a goalie is not a swap anyone makes.
      const own = LINEUP_POSITIONS.filter(
        (position) => (position === 'G') === (row.player.type === 'goalie'),
      );
      const needs = own.filter((position) => keepsLineup(team, row, [position], seats));
      const anyPickup = needs.length === own.length;
      return { row, anyPickup, needs: anyPickup ? [] : needs };
    });
}
