import { DraftPick } from '../../api/models/draft-pick';
import { DraftTeam } from '../../api/models/draft-team';
import { RosterSlots } from '../../api/models/roster-slots';
import { ScoredProjection, ScoringType, StatWeights } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { DraftResultRound, DraftResultTeam } from '../draft-results/draft-results';
import {
  buildLeagueProjection,
  LeagueProjectionData,
  LeagueProjectionPlayer,
  LeagueProjectionTeamInput,
} from '../league-projection';

/**
 * What a summary is built from: who the teams are, in what order they pick, and what they took.
 * The board holds it while a draft is on; the summary page reads the same three off the saved
 * draft — neither needs anything else of the other's state, which is what lets the summary be a
 * page of its own rather than a view inside the board.
 */
export interface DraftBoard {
  readonly teams: readonly DraftTeam[];
  readonly order: readonly string[];
  readonly picks: readonly DraftPick[];
}

/** How the picks are scored: the draft's own league, never the projection's settings. */
export interface DraftSummaryScoring {
  readonly statColumns: ScoringStatKey[];
  readonly rosterSlots: RosterSlots;
  readonly scoringType: ScoringType;
  readonly statWeights: StatWeights | null;
}

/** The player presentation a summary needs — satisfied by DraftPlayerLookupService. */
export interface DraftSummaryLookup {
  name(playerId: number): string;
  positions(playerId: number): string[];
}

/** The picks in draft order, grouped into rounds, with each pick's number within its round. */
export function draftResultRounds(board: DraftBoard): DraftResultRound[] {
  const teamCount = board.teams.length;
  if (teamCount === 0) {
    return [];
  }
  const teamById = byId(board.teams);
  const rounds: DraftResultRound[] = [];
  board.picks.forEach((pick, index) => {
    const overall = index + 1;
    const round = Math.ceil(overall / teamCount);
    const team = teamById.get(pick.teamId);
    const entry = {
      pickInRound: overall - (round - 1) * teamCount,
      overall,
      playerId: pick.playerId,
      teamName: team?.name ?? '',
      mine: team?.mine ?? false,
    };
    const current = rounds[rounds.length - 1];
    if (current && current.round === round) {
      current.picks.push(entry);
    } else {
      rounds.push({ round, picks: [entry] });
    }
  });
  return rounds;
}

/** The same picks grouped by team, the teams in draft order. */
export function draftResultTeams(board: DraftBoard): DraftResultTeam[] {
  const picksByTeam = new Map<string, { overall: number; playerId: number }[]>();
  board.picks.forEach((pick, index) => {
    const list = picksByTeam.get(pick.teamId) ?? [];
    list.push({ overall: index + 1, playerId: pick.playerId });
    picksByTeam.set(pick.teamId, list);
  });
  const teamById = byId(board.teams);
  return board.order
    .map((teamId) => teamById.get(teamId))
    .filter((team) => team !== undefined)
    .map((team) => ({ team, picks: picksByTeam.get(team.id) ?? [] }));
}

/**
 * The league projection behind the summary's table: every team's drafted roster, scored by the
 * same ranking the board was drafted against.
 */
export function draftLeagueProjection(
  board: DraftBoard,
  ranked: readonly ScoredProjection[],
  contributions: ReadonlyMap<number, Record<string, number>>,
  scoring: DraftSummaryScoring,
  lookup: DraftSummaryLookup,
): LeagueProjectionData {
  const isPoints = scoring.scoringType === 'points';
  const scores = new Map(
    ranked.map((scoredProjection) => [
      scoredProjection.projection.playerId,
      isPoints ? scoredProjection.score.fantasyPoints : scoredProjection.score.zScore,
    ]),
  );
  const projectionById = new Map(
    ranked.map((scoredProjection) => [
      scoredProjection.projection.playerId,
      scoredProjection.projection,
    ]),
  );
  const players = new Map<number, LeagueProjectionPlayer>();
  const picksByTeam = new Map<string, number[]>();
  board.picks.forEach((pick) => {
    const list = picksByTeam.get(pick.teamId) ?? [];
    list.push(pick.playerId);
    picksByTeam.set(pick.teamId, list);
    const projection = projectionById.get(pick.playerId);
    if (projection && !players.has(pick.playerId)) {
      players.set(pick.playerId, {
        name: lookup.name(pick.playerId),
        score: scores.get(pick.playerId) ?? 0,
        projection,
        positions: lookup.positions(pick.playerId),
        contributions: contributions.get(pick.playerId) ?? {},
      });
    }
  });
  const teams: LeagueProjectionTeamInput[] = board.teams.map((team) => ({
    id: team.id,
    name: team.name,
    mine: team.mine,
    playerIds: picksByTeam.get(team.id) ?? [],
  }));
  return buildLeagueProjection(
    teams,
    players,
    scoring.statColumns,
    scoring.rosterSlots,
    scoring.scoringType,
    scoring.statWeights,
  );
}

function byId(teams: readonly DraftTeam[]): Map<string, DraftTeam> {
  return new Map(teams.map((team) => [team.id, team]));
}
