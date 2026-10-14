import { RosterSlots } from '../api/models/roster-slots';
import { nhlTeamKey } from '../models/nhl-team';
import { TeamPlayer } from '../services/player-scout.service';
import { lineupSeats, Seat, seating } from '../streamer-planner/planner-lineup';
import { ReserveMove, TeamRoom } from './drop-candidates';

/**
 * What one of the user's players is worth to the lineup over the rest of the season.
 *
 * <p>A player scores only on the nights he starts, and he starts only when a seat he fits is not
 * better filled: a third centre on a roster with two centre seats plays the nights the two ahead
 * of him are off, however many points he would score on the bench. So a player's worth to the
 * team is not his projection but the share of it the lineup lets through, and the player to drop
 * is the one whose going costs the lineup least, which is seldom the lowest projection.
 */
export interface LineupValue {
  readonly playerId: string;
  /** Nights he starts in the lineup over the rest of the season, with the best lineup set each night. */
  readonly starts: number;
  /** Nights his club plays that he could play: not out, and the club's schedule known. */
  readonly games: number;
  /** His value over the nights he starts: his projection a game, times the starts. */
  readonly value: number;
  /** What the lineup loses without him: the team's value with him less without, which is less
   * than his own value where another player would start in his place. */
  readonly marginal: number;
}

/** The whole roster weighed night by night. */
export interface LineupValuation {
  /** The team's value over the rest of the season: every night's starters' value a game, summed. */
  readonly total: number;
  readonly byPlayer: ReadonlyMap<string, LineupValue>;
}

/** A player as a night seats him: where he may sit, what a game of his is worth, when he plays. */
interface Seatable {
  readonly playerId: string;
  readonly positions: readonly string[];
  readonly perGame: number;
  readonly nights: ReadonlySet<string>;
}

/** A pickup to weigh against the roster: the same, read off a row of the list. */
export interface Pickup {
  readonly playerId: string;
  readonly positions: readonly string[];
  readonly teamAbbrev?: string;
  /** His projection over the rest of the season, scored as the roster is. */
  readonly score: number;
}

/**
 * The pickup's best move into the lineup, and what the team gains over the rest of the season by
 * it: an open roster spot and an injured player moved to injured reserve cost nobody, so the gain
 * is what his starts add; a drop costs the dropped player's starts, so the gain is the lineup with
 * him and without the other, less the lineup as it stands.
 */
export type LineupSwap =
  | { readonly kind: 'open'; readonly gain: number }
  | { readonly kind: 'reserve'; readonly move: ReserveMove; readonly gain: number }
  | { readonly kind: 'drop'; readonly drop: TeamPlayer; readonly gain: number };

function clubNights(
  teamAbbrev: string | undefined,
  schedule: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  return new Set(schedule.get(nhlTeamKey(teamAbbrev) ?? '') ?? []);
}

/**
 * The user's players as the nights seat them. A player who is out, or whose club the schedule
 * does not know, plays nowhere; one the model has no line for plays for nothing, and takes a seat
 * only after everyone with a line, as a manager would seat him.
 */
function seatables(
  team: readonly TeamPlayer[],
  schedule: ReadonlyMap<string, readonly string[]>,
  score: (playerId: string) => number | null,
): Seatable[] {
  return team
    .filter((player) => !player.out && player.positions.length > 0)
    .map((player) => {
      const nights = clubNights(player.teamAbbrev, schedule);
      const total = score(player.playerId);
      return {
        playerId: player.playerId,
        positions: player.positions,
        perGame: total === null || nights.size === 0 ? 0 : total / nights.size,
        nights,
      };
    });
}

/** The nights any club plays, each once, in order. */
function allNights(schedule: ReadonlyMap<string, readonly string[]>): string[] {
  const nights = new Set<string>();
  for (const dates of schedule.values()) {
    dates.forEach((date) => nights.add(date));
  }
  return [...nights].sort((a, b) => a.localeCompare(b));
}

/**
 * One night's starters: the players with a game, seated best first, so when more of a kind play
 * than the lineup seats the best of them start. Returns who starts and what they are worth.
 */
function night(
  players: readonly Seatable[],
  date: string,
  seats: readonly Seat[],
): { readonly starters: readonly Seatable[]; readonly value: number } {
  const playing = players
    .filter((player) => player.nights.has(date))
    .sort((a, b) => b.perGame - a.perGame);
  const starters: Seatable[] = [];
  seating(
    playing.map((player) => player.positions),
    seats,
  ).forEach((seatedTonight, index) => {
    if (seatedTonight) {
      starters.push(playing[index]);
    }
  });
  return { starters, value: starters.reduce((sum, player) => sum + player.perGame, 0) };
}

/**
 * The roster weighed over the rest of the season: each player's starts and value, and what the
 * lineup would lose without him. The marginal is counted only over the nights he plays, since the
 * other nights seat the same lineup with or without him.
 */
export function valueLineup(
  team: readonly TeamPlayer[],
  slots: RosterSlots,
  schedule: ReadonlyMap<string, readonly string[]>,
  score: (playerId: string) => number | null,
): LineupValuation {
  const seats = lineupSeats(slots);
  const players = seatables(team, schedule, score);
  const nights = allNights(schedule);
  const starts = new Map<string, number>();
  const nightValues = new Map<string, number>();
  let total = 0;
  for (const date of nights) {
    const tonight = night(players, date, seats);
    total += tonight.value;
    nightValues.set(date, tonight.value);
    for (const starter of tonight.starters) {
      starts.set(starter.playerId, (starts.get(starter.playerId) ?? 0) + 1);
    }
  }
  const byPlayer = new Map<string, LineupValue>();
  for (const player of players) {
    const others = players.filter((other) => other !== player);
    let lost = 0;
    for (const date of player.nights) {
      if (nightValues.has(date)) {
        lost += (nightValues.get(date) ?? 0) - night(others, date, seats).value;
      }
    }
    const started = starts.get(player.playerId) ?? 0;
    byPlayer.set(player.playerId, {
      playerId: player.playerId,
      starts: started,
      games: player.nights.size,
      value: started * player.perGame,
      marginal: lost,
    });
  }
  for (const player of team) {
    if (!byPlayer.has(player.playerId)) {
      byPlayer.set(player.playerId, {
        playerId: player.playerId,
        starts: 0,
        games: 0,
        value: 0,
        marginal: 0,
      });
    }
  }
  return { total, byPlayer };
}

/** The team's value with these players over these nights alone. */
function valueOver(
  players: readonly Seatable[],
  dates: Iterable<string>,
  seats: readonly Seat[],
): number {
  let total = 0;
  for (const date of dates) {
    total += night(players, date, seats).value;
  }
  return total;
}

/**
 * A pickup's best move, and what the lineup gains by it over the rest of the season. An open
 * roster spot first, then the spot an injured player leaves for injured reserve: neither costs
 * anyone, so the gain is what his starts add. Otherwise the drop that leaves the lineup worth the
 * most with him in it: the player whose going costs least where the pickup plays, which a
 * lineup's seats decide rather than the projections alone. Null when the team has nobody of his
 * kind to drop, or nobody the model can weigh.
 *
 * @param room the roster's room without a drop ({@link TeamRoom})
 */
export function swapInto(
  pickup: Pickup,
  team: readonly TeamPlayer[],
  slots: RosterSlots,
  schedule: ReadonlyMap<string, readonly string[]>,
  score: (playerId: string) => number | null,
  room: TeamRoom,
): LineupSwap | null {
  const seats = lineupSeats(slots);
  const players = seatables(team, schedule, score);
  const nights = clubNights(pickup.teamAbbrev, schedule);
  const added: Seatable = {
    playerId: pickup.playerId,
    positions: pickup.positions,
    perGame: nights.size === 0 ? 0 : pickup.score / nights.size,
    nights,
  };
  if (room.openSpots > 0 || room.toReserve.length > 0) {
    // Only the nights he plays change: the others seat the same lineup either way.
    const gain = valueOver([...players, added], nights, seats) - valueOver(players, nights, seats);
    return room.openSpots > 0
      ? { kind: 'open', gain }
      : { kind: 'reserve', move: room.toReserve[0], gain };
  }
  const moving = new Set(room.toReserve.map((move) => move.player.playerId));
  const goalie = pickup.positions.includes('G');
  const droppable = team.filter(
    (player) =>
      !player.reserve &&
      !moving.has(player.playerId) &&
      score(player.playerId) !== null &&
      (player.type === 'goalie') === goalie,
  );
  let best: { readonly swap: LineupSwap; readonly dropScore: number } | null = null;
  for (const drop of droppable) {
    const without = players.filter((player) => player.playerId !== drop.playerId);
    const dropped = players.find((player) => player.playerId === drop.playerId);
    // The nights either of them plays are the only ones the swap moves.
    const touched = new Set([...nights, ...(dropped?.nights ?? [])]);
    const gain =
      valueOver([...without, added], touched, seats) - valueOver(players, touched, seats);
    const dropScore = score(drop.playerId) ?? 0;
    // Two drops that leave the lineup equally well off: the one who projects less goes, since
    // the other is the better player to keep on the bench for the night somebody is hurt.
    if (
      !best ||
      gain > best.swap.gain + 1e-9 ||
      (Math.abs(gain - best.swap.gain) <= 1e-9 && dropScore < best.dropScore)
    ) {
      best = { swap: { kind: 'drop', drop, gain }, dropScore };
    }
  }
  return best?.swap ?? null;
}
