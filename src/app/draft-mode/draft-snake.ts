import { DraftPick } from '../api/models/draft-pick';
import { DraftState } from '../api/models/draft-state';

export interface OnTheClock {
  overallPick: number;
  round: number;
  pickInRound: number;
  teamId: string;
}

export function onClock(pickNumber: number, order: string[]): OnTheClock | null {
  const teamCount = order.length;
  if (teamCount === 0) {
    return null;
  }
  const round = Math.ceil(pickNumber / teamCount);
  const idxInRound = (pickNumber - 1) % teamCount;
  const teamIndex = round % 2 === 1 ? idxInRound : teamCount - 1 - idxInRound;
  return { overallPick: pickNumber, round, pickInRound: idxInRound + 1, teamId: order[teamIndex] };
}

export function picksForTeam(picks: DraftPick[], teamId: string): number[] {
  return picks.filter((pick) => pick.teamId === teamId).map((pick) => pick.playerId);
}

export function isValidDraft(draft: DraftState | null): draft is DraftState {
  if (!draft || draft.teams.length < 2) {
    return false;
  }
  if (draft.teams.filter((team) => team.mine).length !== 1) {
    return false;
  }
  const ids = new Set(draft.teams.map((team) => team.id));
  return new Set(draft.order).size === ids.size && draft.order.every((id) => ids.has(id));
}
