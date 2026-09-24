import { describe, expect, it } from 'vitest';
import { DraftState } from '../api/models/draft-state';
import { LeagueDraftResponse } from '../api/models/league-draft-response';
import {
  boardFromLeagueDraft,
  hasLeagueTeams,
  isLeagueBoard,
  sameBoard,
  unfollowableReason,
} from './league-draft-follow';

const league: LeagueDraftResponse = {
  status: 'IN_PROGRESS',
  auction: false,
  teams: [
    { id: 'l.9.t.2', name: 'Bravo', mine: false },
    { id: 'l.9.t.1', name: 'Alpha', mine: true },
  ],
  picks: [
    { overall: 1, round: 1, teamId: 'l.9.t.2', playerId: 6743 },
    { overall: 2, round: 1, teamId: 'l.9.t.1', playerId: 7109 },
  ],
};

const handEntered: DraftState = {
  teams: [
    { id: 'team-me', name: 'My Team', mine: true },
    { id: 'team-1', name: 'Team 1', mine: false },
  ],
  order: ['team-me', 'team-1'],
  picks: [{ playerId: 1, teamId: 'team-me' }],
  finishedAt: '2026-09-01T00:00:00Z',
};

describe('league draft follow', () => {
  it('takes the league teams in draft order and its picks, keeping the rest of the draft', () => {
    const board = boardFromLeagueDraft(handEntered, league);

    expect(board.order).toEqual(['l.9.t.2', 'l.9.t.1']);
    expect(board.teams.find((team) => team.mine)?.id).toBe('l.9.t.1');
    expect(board.picks).toEqual([
      { playerId: 6743, teamId: 'l.9.t.2' },
      { playerId: 7109, teamId: 'l.9.t.1' },
    ]);
    expect(board.finishedAt).toBe('2026-09-01T00:00:00Z');
  });

  it('builds a board where there was none', () => {
    expect(boardFromLeagueDraft(null, league).teams).toHaveLength(2);
  });

  it('tells an unchanged poll from a new pick', () => {
    const board = boardFromLeagueDraft(null, league);

    expect(sameBoard(board, boardFromLeagueDraft(null, league))).toBe(true);
    expect(
      sameBoard(
        board,
        boardFromLeagueDraft(null, {
          ...league,
          picks: [...league.picks, { overall: 3, round: 2, teamId: 'l.9.t.1', playerId: 5 }],
        }),
      ),
    ).toBe(false);
    expect(sameBoard(null, board)).toBe(false);
  });

  it('refuses an auction draft, a league without the user, and a league of one', () => {
    expect(unfollowableReason(league)).toBeNull();
    expect(unfollowableReason({ ...league, auction: true })).toBe('auction');
    expect(
      unfollowableReason({
        ...league,
        teams: league.teams.map((team) => ({ ...team, mine: false })),
      }),
    ).toBe('no-team');
    expect(unfollowableReason({ ...league, teams: [league.teams[1]] })).toBe('too-few-teams');
  });

  it('knows when following would replace picks entered by hand', () => {
    expect(isLeagueBoard(handEntered, league)).toBe(false);
    expect(isLeagueBoard({ ...handEntered, picks: [] }, league)).toBe(true);
    expect(isLeagueBoard(boardFromLeagueDraft(null, league), league)).toBe(true);
    expect(isLeagueBoard(null, league)).toBe(true);
  });

  it("asks on a board with the league's teams once a pick there is not the league's", () => {
    const followed = boardFromLeagueDraft(null, league);
    expect(isLeagueBoard({ ...followed, picks: followed.picks.slice(0, 1) }, league)).toBe(true);
    expect(
      isLeagueBoard(
        { ...followed, picks: [followed.picks[0], { playerId: 1, teamId: 'l.9.t.1' }] },
        league,
      ),
    ).toBe(false);
    expect(
      isLeagueBoard(
        { ...followed, picks: [...followed.picks, { playerId: 1, teamId: 'l.9.t.2' }] },
        league,
      ),
    ).toBe(false);
    expect(isLeagueBoard(followed, { ...league, picks: [] })).toBe(false);
    expect(hasLeagueTeams(followed, league)).toBe(true);
    expect(hasLeagueTeams(handEntered, league)).toBe(false);
  });
});
