import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamSchedule } from '../api/models/team-schedule';
import { nhlTeamKey } from '../models/nhl-team';
import { lineupSeats, seated } from './planner-lineup';

/**
 * A pickup is seldom made into an empty roster spot: someone is dropped for him, and the seat the
 * dropped player leaves is a seat the pickup, or a player on the bench, can take. Read off the
 * lineup as it stands, a full night says a pickup cannot start there, and a pickup whose club plays
 * Monday and Tuesday looks like one game gained and one lost when Tuesday is full and the man he
 * replaces plays only Tuesday. Swapped, Monday is a game more and Tuesday is the pickup's instead
 * of his: a game gained, not none.
 *
 * So a swap is priced the way a manager would set the lineup after making it: night by night, the
 * team with the pickup in and the dropped player out is seated again, best players first, and
 * what the night is worth is compared with what it was worth before. Games alone would gladly trade
 * a good player's one game for a poor one's two; each game is weighed by what a game of that
 * player's is worth in the league's scoring.
 *
 * Skaters only: a goalie's nights are his crease's to split, not his club's schedule.
 */

/** Slots that hold a player without taking a roster spot, so dropping him makes no room. */
const PARKED_SLOTS: ReadonlySet<string> = new Set(['IR', 'IR+', 'IR-LT', 'IR-NR', 'NA']);

/** Whether he sits in a slot that takes no roster spot: injured reserve or not active. */
export function parked(player: Pick<PlannerRosterPlayer, 'slot'>): boolean {
  return !!player.slot && PARKED_SLOTS.has(player.slot.toUpperCase());
}

/** A skater as a swap places him. */
export interface SwapSkater {
  readonly playerId: string;
  readonly name: string;
  readonly positions: readonly string[];
  /** The nights he plays: his club's game nights among those counted, none while he is out. */
  readonly nights: ReadonlySet<string>;
  /**
   * What one of his club's games is worth to a team, on the league's scale: his line over the
   * stretch, scored, over his club's games. A game he may miss is in it as the chance he misses it.
   * Nought when the model has no line for him.
   */
  readonly value: number;
}

/** What a swap does to one night. */
export interface NightSwap {
  readonly date: string;
  /** Starts gained less starts lost: one where a seat that sat empty is filled. */
  readonly games: number;
  /** What the night's starters are worth after, less before. */
  readonly value: number;
  /** Who starts now and did not: the pickup, or a bench player given the dropped man's seat. */
  readonly started: readonly string[];
  /** Who started and now does not: the dropped player, or one the pickup sends to the bench. */
  readonly sat: readonly string[];
}

/** A pickup for a drop, or into an open roster spot, over the nights counted. */
export interface Swap {
  readonly pickup: SwapSkater;
  /** The player dropped for him; null when a roster spot is open and nobody need go. */
  readonly drop: SwapSkater | null;
  readonly games: number;
  readonly value: number;
  /** Every night counted, in order, each with what the swap does to it. */
  readonly nights: readonly NightSwap[];
}

/** A skater's game nights among those counted, or none while he is out. */
export function skaterNights(
  teamAbbrev: string | undefined,
  out: boolean,
  teams: ReadonlyMap<string, TeamSchedule>,
  counted: ReadonlySet<string>,
): ReadonlySet<string> {
  if (out) {
    return new Set();
  }
  const club = teams.get(nhlTeamKey(teamAbbrev) ?? '');
  return new Set(
    (club?.schedule ?? []).map((game) => game.date).filter((date) => counted.has(date)),
  );
}

/**
 * The players a manager starts on a night, from those playing: the most valuable first, each kept
 * when the seats can still hold him with everyone already kept. Which sets of players fit the seats
 * together is a matroid, so taking the best that still fits gives the most valuable lineup there is,
 * not just a full one. Level values go by player id, so the answer does not move with the order
 * they were listed in.
 */
export function startersOn(
  playing: readonly SwapSkater[],
  seats: ReturnType<typeof lineupSeats>,
): readonly SwapSkater[] {
  const order = [...playing].sort(
    (a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId),
  );
  const starters: SwapSkater[] = [];
  for (const player of order) {
    const tried = [...starters, player].map((starter) => starter.positions);
    if (seated(tried, seats) > starters.length) {
      starters.push(player);
    }
  }
  return starters;
}

function worth(starters: readonly SwapSkater[]): number {
  return starters.reduce((sum, starter) => sum + starter.value, 0);
}

/**
 * The user's team as every swap is weighed against it: its skaters, the seats, the nights counted
 * and who starts on each as things stand, worked out once for the hundreds of pickups priced
 * against it.
 */
export interface SwapContext {
  /** The user's skaters who hold a roster spot, each with the nights he plays. */
  readonly team: readonly SwapSkater[];
  readonly seats: ReturnType<typeof lineupSeats>;
  /** The nights counted, in order. */
  readonly dates: readonly string[];
  /** Who starts each night as the team stands. */
  readonly before: ReadonlyMap<string, readonly SwapSkater[]>;
}

export function swapContext(
  team: readonly SwapSkater[],
  seats: ReturnType<typeof lineupSeats>,
  dates: readonly string[],
): SwapContext {
  const before = new Map(
    dates.map((date) => [
      date,
      startersOn(
        team.filter((player) => player.nights.has(date)),
        seats,
      ),
    ]),
  );
  return { team, seats, dates, before };
}

/** The team's nights with `pickup` in and `drop` out, against the team as it is. */
export function swapOver(context: SwapContext, pickup: SwapSkater, drop: SwapSkater | null): Swap {
  const after = [...context.team.filter((player) => player !== drop), pickup];
  const nights = context.dates.map((date): NightSwap => {
    const before = context.before.get(date) ?? [];
    // A night neither man plays is the night it was.
    if (!pickup.nights.has(date) && !drop?.nights.has(date)) {
      return { date, games: 0, value: 0, started: [], sat: [] };
    }
    const now = startersOn(
      after.filter((player) => player.nights.has(date)),
      context.seats,
    );
    return {
      date,
      games: now.length - before.length,
      value: worth(now) - worth(before),
      started: now.filter((player) => !before.includes(player)).map((player) => player.name),
      sat: before.filter((player) => !now.includes(player)).map((player) => player.name),
    };
  });
  return {
    pickup,
    drop,
    games: nights.reduce((sum, night) => sum + night.games, 0),
    value: nights.reduce((sum, night) => sum + night.value, 0),
    nights,
  };
}

/**
 * A pickup's best swap: into an open roster spot when there is one, else for whichever player the
 * user would drop gains the team most. Level gains go to the one with more games, then to the
 * order the drops were given in. Null when there is no spot and nobody the user would drop.
 */
export function bestSwap(
  context: SwapContext,
  pickup: SwapSkater,
  drops: readonly SwapSkater[],
  openSpot: boolean,
): Swap | null {
  const options: (SwapSkater | null)[] = [...(openSpot ? [null] : []), ...drops];
  let best: Swap | null = null;
  for (const drop of options) {
    const swap = swapOver(context, pickup, drop);
    if (
      !best ||
      swap.value > best.value + VALUE_EPSILON ||
      (Math.abs(swap.value - best.value) <= VALUE_EPSILON && swap.games > best.games)
    ) {
      best = swap;
    }
  }
  return best;
}

/** Gains this close are level: what parts them is the arithmetic's rounding. */
const VALUE_EPSILON = 1e-9;

/**
 * Whether the roster has a spot nobody holds: fewer players off reserve than the league's lineup
 * and bench. A pickup then costs nobody.
 */
export function openRosterSpot(
  roster: readonly PlannerRosterPlayer[],
  slots: RosterSlots,
): boolean {
  const held = roster.filter((player) => !parked(player)).length;
  return held < lineupSeats(slots).length + slots.bn;
}

/** How many of the user's skaters are suggested as drops before he picks his own. */
export const SUGGESTED_DROPS = 3;

/**
 * The skaters suggested as drops: the ones a game of whom is worth least, with a line from the
 * model. A skater with no line is never suggested, since nothing says he is worth little; he can
 * still be picked.
 */
export function suggestedDrops(
  team: readonly SwapSkater[],
  hasLine: (player: SwapSkater) => boolean,
  count = SUGGESTED_DROPS,
): readonly string[] {
  return team
    .filter(hasLine)
    .sort((a, b) => a.value - b.value || a.playerId.localeCompare(b.playerId))
    .slice(0, count)
    .map((player) => player.playerId);
}
