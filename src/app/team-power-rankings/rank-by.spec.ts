import { describe, it, expect } from 'vitest';
import { boardIdOf, rankByBoard, rankByParams } from './rank-by';

describe('rank-by', () => {
  it('sends the model and last season as a source', () => {
    expect(rankByParams('model')).toEqual({ source: 'model' });
    expect(rankByParams('last_season')).toEqual({ source: 'last_season' });
  });

  /** The server reads the board itself; its id is all that goes out. */
  it('sends a board by its id alone', () => {
    expect(rankByParams(rankByBoard('b1'))).toEqual({ projectionId: 'b1' });
  });

  it('reads the board back out of a choice', () => {
    expect(boardIdOf(rankByBoard('b1'))).toEqual('b1');
    expect(boardIdOf('model')).toBeNull();
  });
});
