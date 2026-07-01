import { describe, it, expect } from 'vitest';
import { DraftSnakeService } from './draft-snake.service';
import { DraftState } from '../api/models/draft-state';

const snake = new DraftSnakeService();

describe('DraftSnakeService', () => {
  describe('slotForPick', () => {
    const order = ['a', 'b', 'c'];

    it('returns null for an empty order', () => {
      expect(snake.slotForPick(1, [])).toBeNull();
    });

    it('assigns round 1 left-to-right', () => {
      expect(snake.slotForPick(1, order)).toEqual({
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        teamId: 'a',
      });
      expect(snake.slotForPick(2, order)).toEqual({
        overallPick: 2,
        round: 1,
        pickInRound: 2,
        teamId: 'b',
      });
      expect(snake.slotForPick(3, order)).toEqual({
        overallPick: 3,
        round: 1,
        pickInRound: 3,
        teamId: 'c',
      });
    });

    it('snakes round 2 right-to-left', () => {
      expect(snake.slotForPick(4, order)).toEqual({
        overallPick: 4,
        round: 2,
        pickInRound: 1,
        teamId: 'c',
      });
      expect(snake.slotForPick(5, order)).toEqual({
        overallPick: 5,
        round: 2,
        pickInRound: 2,
        teamId: 'b',
      });
      expect(snake.slotForPick(6, order)).toEqual({
        overallPick: 6,
        round: 2,
        pickInRound: 3,
        teamId: 'a',
      });
    });

    it('returns to left-to-right in round 3', () => {
      expect(snake.slotForPick(7, order)?.teamId).toEqual('a');
      expect(snake.slotForPick(7, order)?.round).toEqual(3);
    });
  });

  describe('picksForTeam', () => {
    it('returns the player ids a team drafted, in order', () => {
      const picks = [
        { playerId: 10, teamId: 'a' },
        { playerId: 20, teamId: 'b' },
        { playerId: 30, teamId: 'a' },
      ];

      expect(snake.picksForTeam(picks, 'a')).toEqual([10, 30]);
      expect(snake.picksForTeam(picks, 'b')).toEqual([20]);
      expect(snake.picksForTeam(picks, 'c')).toEqual([]);
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
      expect(snake.isValidDraft(valid)).toBe(true);
    });

    it('rejects null', () => {
      expect(snake.isValidDraft(null)).toBe(false);
    });

    it('rejects fewer than two teams', () => {
      expect(snake.isValidDraft({ ...valid, teams: [valid.teams[0]], order: ['a'] })).toBe(false);
    });

    it('rejects when not exactly one team is mine', () => {
      expect(
        snake.isValidDraft({
          ...valid,
          teams: [
            { id: 'a', name: 'A', mine: true },
            { id: 'b', name: 'B', mine: true },
          ],
        }),
      ).toBe(false);
    });

    it('rejects when the order is not a permutation of the team ids', () => {
      expect(snake.isValidDraft({ ...valid, order: ['a', 'a'] })).toBe(false);
    });
  });
});
