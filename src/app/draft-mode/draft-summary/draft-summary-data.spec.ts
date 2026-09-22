import { describe, it, expect } from 'vitest';
import { DraftBoard, draftResultRounds, draftResultTeams } from './draft-summary-data';

/**
 * The shapes the summary's Draft results tab reads. They used to be derived inside the draft
 * board; they are here because the summary is a page of its own now, and both build them the
 * same way from the same three things.
 */
describe('draft summary results', () => {
  const board: DraftBoard = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [
      { playerId: 1, teamId: 'team-me' },
      { playerId: 2, teamId: 'team-1' },
      { playerId: 3, teamId: 'team-1' },
    ],
  };

  it('builds ascending rounds with round-relative pick numbers', () => {
    const rounds = draftResultRounds(board);

    expect(rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(rounds[0].picks.map((pick) => pick.pickInRound)).toEqual([1, 2]);
    expect(rounds[0].picks.map((pick) => pick.overall)).toEqual([1, 2]);
    expect(rounds[0].picks.map((pick) => pick.playerId)).toEqual([1, 2]);
    expect(rounds[0].picks[0].mine).toBe(true);
    expect(rounds[0].picks[1].teamName).toEqual('Team 1');
    expect(rounds[1].picks[0].pickInRound).toEqual(1);
    expect(rounds[1].picks[0].overall).toEqual(3);
    expect(rounds[1].picks[0].playerId).toEqual(3);
  });

  it('groups the picks by team in draft order, with overall pick numbers', () => {
    const teams = draftResultTeams(board);

    expect(teams.map((entry) => entry.team.id)).toEqual(['team-me', 'team-1']);
    expect(teams[0].picks).toEqual([{ overall: 1, playerId: 1 }]);
    expect(teams[1].picks).toEqual([
      { overall: 2, playerId: 2 },
      { overall: 3, playerId: 3 },
    ]);
  });

  it('has nothing to show for a board without teams', () => {
    expect(draftResultRounds({ teams: [], order: [], picks: [] })).toEqual([]);
    expect(draftResultTeams({ teams: [], order: [], picks: [] })).toEqual([]);
  });
});
