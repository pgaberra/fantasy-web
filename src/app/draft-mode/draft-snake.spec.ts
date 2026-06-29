import { describe, it, expect } from 'vitest';
import { isValidDraft, onClock, picksForTeam } from './draft-snake';
import { DraftState } from '../api/models/draft-state';

describe('onClock', () => {
  const order = ['a', 'b', 'c'];

  it('returns null for an empty order', () => {
    expect(onClock(1, [])).toBeNull();
  });

  it('assigns round 1 left-to-right', () => {
    expect(onClock(1, order)).toEqual({ overallPick: 1, round: 1, pickInRound: 1, teamId: 'a' });
    expect(onClock(2, order)).toEqual({ overallPick: 2, round: 1, pickInRound: 2, teamId: 'b' });
    expect(onClock(3, order)).toEqual({ overallPick: 3, round: 1, pickInRound: 3, teamId: 'c' });
  });

  it('snakes round 2 right-to-left', () => {
    expect(onClock(4, order)).toEqual({ overallPick: 4, round: 2, pickInRound: 1, teamId: 'c' });
    expect(onClock(5, order)).toEqual({ overallPick: 5, round: 2, pickInRound: 2, teamId: 'b' });
    expect(onClock(6, order)).toEqual({ overallPick: 6, round: 2, pickInRound: 3, teamId: 'a' });
  });

  it('returns to left-to-right in round 3', () => {
    expect(onClock(7, order)?.teamId).toEqual('a');
    expect(onClock(7, order)?.round).toEqual(3);
  });
});

describe('picksForTeam', () => {
  it('returns the player ids a team drafted, in order', () => {
    const picks = [
      { playerId: 10, teamId: 'a' },
      { playerId: 20, teamId: 'b' },
      { playerId: 30, teamId: 'a' },
    ];

    expect(picksForTeam(picks, 'a')).toEqual([10, 30]);
    expect(picksForTeam(picks, 'b')).toEqual([20]);
    expect(picksForTeam(picks, 'c')).toEqual([]);
  });
});

describe('isValidDraft', () => {
  const valid: DraftState = {
    teams: [
      { id: 'a', name: 'A', mine: true },
      { id: 'b', name: 'B', mine: false },
    ],
    order: ['a', 'b'],
    picks: [],
  };

  it('accepts a well-formed draft', () => {
    expect(isValidDraft(valid)).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidDraft(null)).toBe(false);
  });

  it('rejects fewer than two teams', () => {
    expect(isValidDraft({ ...valid, teams: [valid.teams[0]], order: ['a'] })).toBe(false);
  });

  it('rejects when not exactly one team is mine', () => {
    expect(
      isValidDraft({
        ...valid,
        teams: [
          { id: 'a', name: 'A', mine: true },
          { id: 'b', name: 'B', mine: true },
        ],
      }),
    ).toBe(false);
  });

  it('rejects when the order is not a permutation of the team ids', () => {
    expect(isValidDraft({ ...valid, order: ['a', 'a'] })).toBe(false);
  });
});
