import { describe, it, expect } from 'vitest';
import { freeNameFrom, freeProjectionName } from './projection-name';

describe('freeProjectionName', () => {
  it('starts at the plain name', () => {
    expect(freeProjectionName([])).toEqual('My Projection');
  });

  it('takes the first number that is free', () => {
    expect(freeProjectionName(['My Projection'])).toEqual('My Projection 2');
    expect(freeProjectionName(['My Projection', 'My Projection 2'])).toEqual('My Projection 3');
  });
});

describe('freeNameFrom', () => {
  it('keeps the preferred name when nothing holds it', () => {
    expect(freeNameFrom('AI Projection', ['Beer League'])).toEqual('AI Projection');
  });

  /**
   * What the draft heading has to say before the draft exists: the server numbers a name the
   * user already holds, so a heading that shows the plain name promises one it will not get.
   */
  it('numbers a name that is taken, and keeps numbering', () => {
    expect(freeNameFrom('AI Projection', ['AI Projection'])).toEqual('AI Projection (2)');
    expect(freeNameFrom('AI Projection', ['AI Projection', 'AI Projection (2)'])).toEqual(
      'AI Projection (3)',
    );
  });

  /** A name is capped at 100 characters, and the suffix has to fit inside that. */
  it('truncates so the suffix fits the hundred characters a name gets', () => {
    const long = 'x'.repeat(100);

    expect(freeNameFrom(long, []).length).toEqual(100);
    expect(freeNameFrom(long, [long])).toEqual('x'.repeat(96) + ' (2)');
  });
});
