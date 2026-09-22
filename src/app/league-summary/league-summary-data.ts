import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { LeagueSummaryTeam } from '../api/models/league-summary-team';
import { ScoringType } from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import {
  categoryColumnFor,
  LeagueProjectionData,
  LeagueProjectionRosterRow,
  LeagueProjectionTeamRow,
  positionColumnFor,
} from '../draft-mode/league-projection';

/** What a league's totals are called, which the league's own scoring decides. */
export function scoreHeadingFor(summary: LeagueSummaryResponse): string {
  return summary.scoringType === 'category' ? 'Z-Score' : 'Total Points';
}

/**
 * A league the BFF totalled, in the shape the league table already draws.
 *
 * <p>The numbers arrive done: they are computed on the server so that an account without premium
 * can be shown the totals without being handed the lines behind them. What comes back is bare
 * keys and values, because how a column is labelled, and to how many decimals, is the web's
 * business — the same answer here as for a draft board, from the same two functions.
 *
 * <p>A team without premium carries no roster and no lineup, so its rows are empty rather than
 * absent: the table renders a team with nothing to expand, and the page is what says why.
 */
export function leagueProjectionFrom(summary: LeagueSummaryResponse): LeagueProjectionData {
  const scoringType: ScoringType = summary.scoringType === 'category' ? 'category' : 'points';
  return {
    categoryColumns: summary.categoryKeys.map((key) =>
      categoryColumnFor(key as ScoringStatKey, scoringType, null),
    ),
    positionColumns: summary.positionKeys.map((key) => positionColumnFor(key)),
    teams: summary.teams.map((team) => teamRow(team, summary.categoryKeys)),
  };
}

function teamRow(team: LeagueSummaryTeam, categoryKeys: string[]): LeagueProjectionTeamRow {
  return {
    teamId: team.teamId,
    name: team.name,
    mine: team.mine,
    total: team.total,
    values: team.values,
    roster: (team.roster ?? []).map((row) => rosterRow(row, categoryKeys)),
    positionPlayers: team.positionPlayers ?? {},
  };
}

function rosterRow(
  row: NonNullable<LeagueSummaryTeam['roster']>[number],
  categoryKeys: string[],
): LeagueProjectionRosterRow {
  const values: Record<string, number | null> = {};
  const contributions: Record<string, number | null> = {};
  for (const key of categoryKeys) {
    values[key] = row.values?.[key] ?? null;
    contributions[key] = row.contributions?.[key] ?? null;
  }
  return { name: row.name, total: row.total, values, contributions };
}
