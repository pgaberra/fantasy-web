import { Projection, ScoringType, StatWeights } from '../models/projection.model';
import { ScoringStatKey, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { STAT_LABELS } from '../pipes/stat-label.pipe';
import { STAT_FULL_NAMES } from '../pipes/stat-tooltip.pipe';
import { RosterSlots } from '../api/models/roster-slots';

const RATE_STAT_KEYS: ReadonlySet<ScoringStatKey> = new Set(['shPct', 'svPct', 'gaa']);
const RATE_DECIMALS: Record<string, number> = { svPct: 3, gaa: 2, shPct: 1 };
const SKATER_STAT_KEY_SET: ReadonlySet<string> = new Set(SKATER_SCORING_STAT_KEYS);

export interface LeagueProjectionColumn {
  key: string;
  label: string;
  tooltip: string | null;
  /** Decimals for the aggregated cell value shown in the table. */
  decimals: number;
  /** Decimals for the per-player raw values listed when a row is expanded. */
  rawDecimals: number;
  /**
   * Points awarded per unit of this stat in a points league — the multiplier behind the cell
   * values. Null for category/roto leagues (where the basis is a z-score, not a point value)
   * and for position columns.
   */
  weight: number | null;
}

export interface LeagueProjectionContributor {
  name: string;
  value: number;
}

/**
 * One drafted player, as a row under an expanded team in the category breakdown. In that mode a
 * player contributes to *every* category, so listing them per column would repeat the same names
 * across the row — a player row keeps each of them exactly once and lets you read their whole line.
 */
export interface LeagueProjectionRosterRow {
  name: string;
  /** The player's overall projected value (fantasy points or z-score), matching the team total's basis. */
  total: number;
  /** Raw stat value per category key; null where the stat doesn't apply to this player (a goalie has no hits). */
  values: Record<string, number | null>;
  /**
   * The player's direction-adjusted contribution per category key (higher is always better, mirroring
   * how the team rows aggregate and sort) — used to order the roster when the table is sorted on a
   * category column. Null where the stat doesn't apply, so those players sort to the bottom.
   */
  contributions: Record<string, number | null>;
}

export interface LeagueProjectionTeamRow {
  teamId: string;
  name: string;
  mine: boolean;
  total: number;
  /** Aggregated value per column key (weighted/z contribution for categories, summed score for positions). */
  values: Record<string, number>;
  /** The team's drafted players, best first — the rows shown when a category-mode team is expanded. */
  roster: LeagueProjectionRosterRow[];
  /** Per position column key (incl. BN): the players assigned to that slot, sorted by projected value. */
  positionPlayers: Record<string, LeagueProjectionContributor[]>;
}

export interface LeagueProjectionData {
  categoryColumns: LeagueProjectionColumn[];
  positionColumns: LeagueProjectionColumn[];
  teams: LeagueProjectionTeamRow[];
}

export interface LeagueProjectionPlayer {
  name: string;
  /** Overall projected value (fantasy points or z-score, matching the league's scoring type). */
  score: number;
  projection: Projection;
  /** Eligible position codes (C/LW/RW/D for skaters, G for goalies). */
  positions: string[];
  /** Per active category key: this player's weighted/z contribution to their overall score. */
  contributions: Record<string, number>;
}

export interface LeagueProjectionTeamInput {
  id: string;
  name: string;
  mine: boolean;
  playerIds: number[];
}

interface AssignablePlayer {
  playerId: number;
  name: string;
  score: number;
  isGoalie: boolean;
  positions: ReadonlySet<string>;
}

interface SlotDef {
  key: keyof RosterSlots;
  col: string;
  label: string;
  full: string;
}

const BENCH_COL = 'BN';

/**
 * Starting (counting) lineup slots, in display and placement-priority order. Forwards read
 * left-to-right as they line up on the ice — LW, C, RW — then D, Util, G (named positions before
 * Util). Reordering only shifts which slot a dual-eligible player is shown under; the
 * maximum-matching in {@link assignRosterSlots} still starts the same set of players.
 */
const STARTING_SLOT_DEFS: SlotDef[] = [
  { key: 'lw', col: 'LW', label: 'LW', full: 'Left Wing' },
  { key: 'c', col: 'C', label: 'C', full: 'Center' },
  { key: 'rw', col: 'RW', label: 'RW', full: 'Right Wing' },
  { key: 'd', col: 'D', label: 'D', full: 'Defense' },
  { key: 'util', col: 'UTIL', label: 'Util', full: 'Utility' },
  { key: 'g', col: 'G', label: 'G', full: 'Goalie' },
];

function slotEligible(def: SlotDef, player: AssignablePlayer): boolean {
  switch (def.key) {
    case 'c':
      return !player.isGoalie && player.positions.has('C');
    case 'lw':
      return !player.isGoalie && player.positions.has('LW');
    case 'rw':
      return !player.isGoalie && player.positions.has('RW');
    case 'd':
      return !player.isGoalie && player.positions.has('D');
    case 'util':
      return !player.isGoalie;
    case 'g':
      return player.isGoalie;
    default:
      return false;
  }
}

/**
 * Places a team's drafted players into its league roster slots so each player counts once and the
 * weakest players end up on the bench.
 *
 * Two phases. First, players are matched best-first to the *named* starting slots (C/LW/RW/D/G) as a
 * maximum-weight bipartite matching with augmenting reassignment — so a dual-position player yields a
 * named slot to a single-position player when that lets more of the roster start, and the best
 * eligible player fills each named slot. Whoever is left over (couldn't claim a named slot) fills the
 * Util flex best-first (skaters only); the rest fall to the bench. Filling Util from the leftovers,
 * rather than folding it into the matching, keeps the strongest players in their named slots and
 * leaves the marginal starter in Util — which is how a manager reads the lineup.
 */
function assignRosterSlots(
  players: AssignablePlayer[],
  rosterSlots: RosterSlots,
): { byCol: Map<string, AssignablePlayer[]>; bench: AssignablePlayer[] } {
  const namedSlots: SlotDef[] = [];
  for (const def of STARTING_SLOT_DEFS) {
    if (def.key === 'util') {
      continue;
    }
    for (let index = 0; index < rosterSlots[def.key]; index++) {
      namedSlots.push(def);
    }
  }

  const ordered = [...players].sort(
    (first, second) => second.score - first.score || first.playerId - second.playerId,
  );
  const slotToPlayer: (number | null)[] = namedSlots.map(() => null);
  const playerToSlot: (number | null)[] = ordered.map(() => null);

  const tryAssign = (playerIndex: number, visited: boolean[]): boolean => {
    for (let slot = 0; slot < namedSlots.length; slot++) {
      if (visited[slot] || !slotEligible(namedSlots[slot], ordered[playerIndex])) {
        continue;
      }
      visited[slot] = true;
      const occupant = slotToPlayer[slot];
      if (occupant === null || tryAssign(occupant, visited)) {
        slotToPlayer[slot] = playerIndex;
        playerToSlot[playerIndex] = slot;
        return true;
      }
    }
    return false;
  };

  ordered.forEach((_player, index) => {
    tryAssign(
      index,
      namedSlots.map(() => false),
    );
  });

  const byCol = new Map<string, AssignablePlayer[]>();
  const leftover: AssignablePlayer[] = [];
  ordered.forEach((player, index) => {
    const slot = playerToSlot[index];
    if (slot === null) {
      leftover.push(player);
      return;
    }
    const col = namedSlots[slot].col;
    const list = byCol.get(col) ?? [];
    list.push(player);
    byCol.set(col, list);
  });

  // Leftovers stay in descending-score order; the best eligible skaters take the Util flex.
  const utilPlayers: AssignablePlayer[] = [];
  const bench: AssignablePlayer[] = [];
  for (const player of leftover) {
    if (!player.isGoalie && utilPlayers.length < rosterSlots.util) {
      utilPlayers.push(player);
    } else {
      bench.push(player);
    }
  }
  if (utilPlayers.length > 0) {
    byCol.set('UTIL', utilPlayers);
  }

  return { byCol, bench };
}

function categoryColumnsFor(
  activeScoringColumns: readonly ScoringStatKey[],
  scoringType: ScoringType,
  statWeights: Partial<StatWeights> | null,
): LeagueProjectionColumn[] {
  const isPoints = scoringType === 'points';
  const aggregateDecimals = isPoints ? 1 : 2;
  return activeScoringColumns.map((key) => ({
    key,
    label: STAT_LABELS[key],
    tooltip: STAT_FULL_NAMES[key] === STAT_LABELS[key] ? null : STAT_FULL_NAMES[key],
    decimals: aggregateDecimals,
    rawDecimals: RATE_STAT_KEYS.has(key) ? (RATE_DECIMALS[key] ?? 2) : 0,
    weight: isPoints ? (statWeights?.[key] ?? null) : null,
  }));
}

function positionColumnsFor(
  rosterSlots: RosterSlots,
  includeBench: boolean,
): LeagueProjectionColumn[] {
  const columns: LeagueProjectionColumn[] = STARTING_SLOT_DEFS.filter(
    (def) => rosterSlots[def.key] > 0,
  ).map((def) => ({
    key: def.col,
    label: def.label,
    tooltip: def.full,
    decimals: 1,
    rawDecimals: 1,
    weight: null,
  }));
  if (includeBench) {
    columns.push({
      key: BENCH_COL,
      label: 'BN',
      tooltip: 'Bench',
      decimals: 1,
      rawDecimals: 1,
      weight: null,
    });
  }
  return columns;
}

/**
 * Aggregates the drafted rosters into a league-wide comparison. Each category cell holds the team's
 * weighted-points (or z-score) contribution for that stat, so a row's category cells sum to its
 * overall total. Each position cell holds the summed value of the players assigned to that roster
 * slot ({@link assignRosterSlots} places every player exactly once, weakest on the bench), so the
 * position cells likewise sum to the total. Teams come back sorted by total; the table re-sorts on demand.
 */
export function buildLeagueProjection(
  teams: LeagueProjectionTeamInput[],
  playersById: Map<number, LeagueProjectionPlayer>,
  activeScoringColumns: readonly ScoringStatKey[],
  rosterSlots: RosterSlots,
  scoringType: ScoringType,
  statWeights: Partial<StatWeights> | null,
): LeagueProjectionData {
  const categoryColumns = categoryColumnsFor(activeScoringColumns, scoringType, statWeights);

  interface PartialTeamRow {
    teamId: string;
    name: string;
    mine: boolean;
    total: number;
    values: Record<string, number>;
    roster: LeagueProjectionRosterRow[];
    byCol: Map<string, AssignablePlayer[]>;
    bench: AssignablePlayer[];
  }

  const partials: PartialTeamRow[] = teams.map((team) => {
    const players = team.playerIds
      .map((id) => {
        const player = playersById.get(id);
        return player ? { id, player } : null;
      })
      .filter((entry) => entry !== null);

    const total = players.reduce((sum, entry) => sum + entry.player.score, 0);

    // A category cell aggregates only the players the stat applies to — a goalie contributes no
    // hits, a skater no saves — so each column sums over its own side of the roster.
    const values: Record<string, number> = {};
    for (const column of categoryColumns) {
      const key = column.key;
      const wantsSkater = SKATER_STAT_KEY_SET.has(key);
      values[key] = players
        .filter((entry) => (entry.player.projection.type === 'skater') === wantsSkater)
        .reduce((sum, entry) => sum + (entry.player.contributions[key] ?? 0), 0);
    }

    const roster: LeagueProjectionRosterRow[] = players
      .map((entry) => {
        const isSkater = entry.player.projection.type === 'skater';
        const scoring = entry.player.projection.stats.scoring as Record<string, number>;
        const rosterValues: Record<string, number | null> = {};
        const rosterContributions: Record<string, number | null> = {};
        for (const column of categoryColumns) {
          const applies = SKATER_STAT_KEY_SET.has(column.key) === isSkater;
          rosterValues[column.key] = applies ? (scoring[column.key] ?? 0) : null;
          rosterContributions[column.key] = applies
            ? (entry.player.contributions[column.key] ?? 0)
            : null;
        }
        return {
          name: entry.player.name,
          total: entry.player.score,
          values: rosterValues,
          contributions: rosterContributions,
        };
      })
      .sort((first, second) => second.total - first.total);

    const assignables: AssignablePlayer[] = players.map((entry) => ({
      playerId: entry.id,
      name: entry.player.name,
      score: entry.player.score,
      isGoalie: entry.player.projection.type === 'goalie',
      positions: new Set(entry.player.positions),
    }));
    const { byCol, bench } = assignRosterSlots(assignables, rosterSlots);

    return {
      teamId: team.id,
      name: team.name,
      mine: team.mine,
      total,
      values,
      roster,
      byCol,
      bench,
    };
  });

  const includeBench = rosterSlots.bn > 0 || partials.some((partial) => partial.bench.length > 0);
  const positionColumns = positionColumnsFor(rosterSlots, includeBench);

  const teamRows: LeagueProjectionTeamRow[] = partials.map((partial) => {
    const positionPlayers: Record<string, LeagueProjectionContributor[]> = {};
    for (const column of positionColumns) {
      const assigned =
        column.key === BENCH_COL ? partial.bench : (partial.byCol.get(column.key) ?? []);
      const contributors = [...assigned]
        .sort((first, second) => second.score - first.score || first.playerId - second.playerId)
        .map((player) => ({ name: player.name, value: player.score }));
      positionPlayers[column.key] = contributors;
      partial.values[column.key] = contributors.reduce((sum, entry) => sum + entry.value, 0);
    }

    return {
      teamId: partial.teamId,
      name: partial.name,
      mine: partial.mine,
      total: partial.total,
      values: partial.values,
      roster: partial.roster,
      positionPlayers,
    };
  });

  teamRows.sort((first, second) => second.total - first.total);

  return { categoryColumns, positionColumns, teams: teamRows };
}
