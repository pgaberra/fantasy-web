import { describe, expect, it } from 'vitest';
import { nhlTeamKey } from './nhl-team';

describe('nhlTeamKey', () => {
  it("folds a platform's spelling to the NHL's", () => {
    expect(nhlTeamKey('TB')).toBe('TBL');
    expect(nhlTeamKey('nj')).toBe('NJD');
    expect(nhlTeamKey('LAK')).toBe('LAK');
  });

  it('is null for nothing', () => {
    expect(nhlTeamKey(null)).toBeNull();
    expect(nhlTeamKey(undefined)).toBeNull();
    expect(nhlTeamKey(' ')).toBeNull();
  });
});
