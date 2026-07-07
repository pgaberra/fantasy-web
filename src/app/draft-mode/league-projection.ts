import { Projection } from '../models/projection.model';
import {
  LOWER_IS_BETTER_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../models/stat-key.model';
import { STAT_LABELS } from '../pipes/stat-label.pipe';
import { STAT_FULL_NAMES } from '../pipes/stat-tooltip.pipe';

export const POSITION_KEYS = ['C', 'LW', 'RW', 'D', 'G'] as const;
export type PositionKey = (typeof POSITION_KEYS)[number];

const POSITION_FULL_NAMES: Record<PositionKey, string> = {
  C: 'Center',
  LW: 'Left Wing',
  RW: 'Right Wing',
  D: 'Defense',
  G: 'Goalie',
};

const RATE_STAT_KEYS: ReadonlySet<ScoringStatKey> = new Set(['shPct', 'svPct', 'gaa']);
const RATE_DECIMALS: Record<string, number> = { svPct: 3, gaa: 2, shPct: 1 };
const SKATER_STAT_KEY_SET: ReadonlySet<string> = new Set(SKATER_SCORING_STAT_KEYS);

export interface LeagueProjectionColumn {
  key: string;
  label: string;
  tooltip: string | null;
  lowerIsBetter: boolean;
  decimals: number;
}

export interface LeagueProjectionBreakdownPlayer {
  name: string;
  value: number;
}

export interface LeagueProjectionTeamRow {
  teamId: string;
  name: string;
  mine: boolean;
  total: number;
  values: Record<string, number | null>;
  positionBreakdown: Record<string, LeagueProjectionBreakdownPlayer[]>;
}

export interface LeagueProjectionData {
  categoryColumns: LeagueProjectionColumn[];
  positionColumns: LeagueProjectionColumn[];
  teams: LeagueProjectionTeamRow[];
}

export interface LeagueProjectionPlayer {
  name: string;
  score: number;
  projection: Projection;
  positions: string[];
}

export interface LeagueProjectionTeamInput {
  id: string;
  name: string;
  mine: boolean;
  playerIds: number[];
}

/**
 * Aggregates the drafted rosters into a league-wide comparison: each team's projected total
 * plus a per-category breakdown (raw projected stats — summed, or averaged for rate stats like
 * SV%/GAA) and a per-position breakdown (summed projected value of every eligible player, so a
 * C/LW skater counts toward both). Teams come back sorted by total; the table re-sorts on demand.
 */
export function buildLeagueProjection(
  teams: LeagueProjectionTeamInput[],
  playersById: Map<number, LeagueProjectionPlayer>,
  activeScoringColumns: readonly ScoringStatKey[],
): LeagueProjectionData {
  const categoryColumns: LeagueProjectionColumn[] = activeScoringColumns.map((key) => ({
    key,
    label: STAT_LABELS[key],
    tooltip: STAT_FULL_NAMES[key] === STAT_LABELS[key] ? null : STAT_FULL_NAMES[key],
    lowerIsBetter: LOWER_IS_BETTER_SCORING_STAT_KEYS.has(key),
    decimals: RATE_STAT_KEYS.has(key) ? (RATE_DECIMALS[key] ?? 2) : 0,
  }));

  const positionColumns: LeagueProjectionColumn[] = POSITION_KEYS.map((key) => ({
    key,
    label: key,
    tooltip: POSITION_FULL_NAMES[key],
    lowerIsBetter: false,
    decimals: 1,
  }));

  const teamRows: LeagueProjectionTeamRow[] = teams.map((team) => {
    const players = team.playerIds
      .map((id) => playersById.get(id))
      .filter((player) => player !== undefined);

    const total = players.reduce((sum, player) => sum + player.score, 0);
    const values: Record<string, number | null> = {};

    for (const column of categoryColumns) {
      const key = column.key as ScoringStatKey;
      const wantsSkater = SKATER_STAT_KEY_SET.has(key);
      const contributions = players
        .filter((player) =>
          wantsSkater ? player.projection.type === 'skater' : player.projection.type === 'goalie',
        )
        .map((player) => (player.projection.stats.scoring as Record<string, number>)[key] ?? 0);
      if (contributions.length === 0) {
        values[key] = RATE_STAT_KEYS.has(key) ? null : 0;
      } else {
        const sum = contributions.reduce((running, value) => running + value, 0);
        values[key] = RATE_STAT_KEYS.has(key) ? sum / contributions.length : sum;
      }
    }

    const positionBreakdown: Record<string, LeagueProjectionBreakdownPlayer[]> = {};
    for (const column of positionColumns) {
      const eligible = players
        .filter((player) => player.positions.includes(column.key))
        .map((player) => ({ name: player.name, value: player.score }))
        .sort((first, second) => second.value - first.value);
      positionBreakdown[column.key] = eligible;
      values[column.key] = eligible.reduce((sum, player) => sum + player.value, 0);
    }

    return {
      teamId: team.id,
      name: team.name,
      mine: team.mine,
      total,
      values,
      positionBreakdown,
    };
  });

  teamRows.sort((first, second) => second.total - first.total);

  return { categoryColumns, positionColumns, teams: teamRows };
}
