import { DraftState } from '../api/models/draft-state';
import { LeagueDraftResponse } from '../api/models/league-draft-response';

/** Why a league's draft cannot be followed, or null when it can. */
export type UnfollowableReason = 'auction' | 'no-team' | 'too-few-teams';

export function unfollowableReason(league: LeagueDraftResponse): UnfollowableReason | null {
  if (league.auction) {
    return 'auction';
  }
  if (league.teams.length < 2) {
    return 'too-few-teams';
  }
  if (league.teams.filter((team) => team.mine).length !== 1) {
    return 'no-team';
  }
  return null;
}

/**
 * The draft board as the league has it: the league's teams, in its draft order, and the picks made
 * there. Whatever else the draft holds (its league settings, whether it was finished) is kept.
 */
export function boardFromLeagueDraft(
  current: DraftState | null,
  league: LeagueDraftResponse,
): DraftState {
  return {
    ...current,
    teams: league.teams.map((team) => ({ id: team.id, name: team.name, mine: team.mine })),
    order: league.teams.map((team) => team.id),
    picks: league.picks.map((pick) => ({ playerId: pick.playerId, teamId: pick.teamId })),
  };
}

/** Whether two boards have the same teams, order and picks, so a poll that changed nothing saves nothing. */
export function sameBoard(a: DraftState | null, b: DraftState): boolean {
  if (!a) {
    return false;
  }
  return (
    a.teams.length === b.teams.length &&
    a.teams.every(
      (team, index) =>
        team.id === b.teams[index].id &&
        team.name === b.teams[index].name &&
        team.mine === b.teams[index].mine,
    ) &&
    a.order.length === b.order.length &&
    a.order.every((id, index) => id === b.order[index]) &&
    a.picks.length === b.picks.length &&
    a.picks.every(
      (pick, index) =>
        pick.playerId === b.picks[index].playerId && pick.teamId === b.picks[index].teamId,
    )
  );
}

/** Whether the board already is this league's, so following it replaces nothing the user entered. */
export function isLeagueBoard(current: DraftState | null, league: LeagueDraftResponse): boolean {
  if (!current || current.picks.length === 0) {
    return true;
  }
  const leagueTeamIds = new Set(league.teams.map((team) => team.id));
  return current.teams.every((team) => leagueTeamIds.has(team.id));
}
