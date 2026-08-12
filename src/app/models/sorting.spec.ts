import { describe, expect, it } from 'vitest';
import { compareStatValues, defaultSortDirection, statValueOf } from './sorting';
import { Projection } from './projection.model';
import { LOWER_IS_BETTER_SCORING_STAT_KEYS, RATE_STAT_KEYS } from './stat-key.model';

describe('defaultSortDirection', () => {
  it('opens a stat where the biggest number is the best one at the top', () => {
    expect(defaultSortDirection('goals')).toEqual('desc');
    expect(defaultSortDirection('sv')).toEqual('desc');
  });

  it('opens a rate stat where a low number is the good one at the low end instead', () => {
    expect(defaultSortDirection('gaa')).toEqual('asc');
  });

  it('leaves the running totals a low number flatters pointing down', () => {
    // Fewest goals against and fewest losses belong to whoever barely played, so opening these
    // at the low end would answer with the goalies who never dress.
    expect(defaultSortDirection('ga')).toEqual('desc');
    expect(defaultSortDirection('l')).toEqual('desc');
  });

  it('ascends exactly the stats that are both lower-is-better and a rate', () => {
    const ascending = [...LOWER_IS_BETTER_SCORING_STAT_KEYS].filter(
      (statKey) => defaultSortDirection(statKey) === 'asc',
    );
    expect(ascending).toEqual(
      [...LOWER_IS_BETTER_SCORING_STAT_KEYS].filter((statKey) =>
        (RATE_STAT_KEYS as readonly string[]).includes(statKey),
      ),
    );
  });

  it('sorts names alphabetically rather than backwards', () => {
    expect(defaultSortDirection('name')).toEqual('asc');
  });

  it('puts the best players first for the summary column', () => {
    expect(defaultSortDirection('summary')).toEqual('desc');
  });
});

describe('statValueOf', () => {
  const goalie = (gp: number, gaa: number): Projection =>
    ({
      type: 'goalie',
      playerId: 1,
      stats: { scoring: { gaa, ga: 40 }, utility: { gp } },
    }) as unknown as Projection;

  it('reads a stat the player has', () => {
    expect(statValueOf(goalie(50, 2.4), 'gaa')).toBeCloseTo(2.4);
    expect(statValueOf(goalie(50, 2.4), 'ga')).toEqual(40);
  });

  it('has no value for a stat the player cannot have', () => {
    expect(statValueOf(goalie(50, 2.4), 'hits')).toBeNull();
  });

  it('has no rate for a player with no games to rate', () => {
    expect(statValueOf(goalie(0, 0), 'gaa')).toBeNull();
  });

  it('still counts the running totals of a player with no games', () => {
    // Only rates need a denominator; a total of zero is a real zero.
    expect(statValueOf(goalie(0, 0), 'ga')).toEqual(40);
  });
});

describe('compareStatValues', () => {
  const DESC = -1;
  const ASC = 1;

  it('orders two real values the way the sign points', () => {
    expect(compareStatValues(2, 5, DESC)).toBeGreaterThan(0);
    expect(compareStatValues(2, 5, ASC)).toBeLessThan(0);
  });

  it('sinks a player the stat does not apply to, even sorting ascending', () => {
    // The case that made this necessary: ascending GA must not answer with a screen of skaters.
    expect(compareStatValues(null, 5, ASC)).toBeGreaterThan(0);
    expect(compareStatValues(5, null, ASC)).toBeLessThan(0);
  });

  it('sinks them sorting descending too', () => {
    expect(compareStatValues(null, 5, DESC)).toBeGreaterThan(0);
    expect(compareStatValues(5, null, DESC)).toBeLessThan(0);
  });

  it('keeps a real zero above an absent stat rather than treating them alike', () => {
    expect(compareStatValues(0, null, ASC)).toBeLessThan(0);
    expect(compareStatValues(0, null, DESC)).toBeLessThan(0);
  });

  it('reports a tie so the caller can break it', () => {
    // Compared with === because a descending tie is -0, which a comparator treats as a tie but
    // toEqual(0) does not.
    expect(compareStatValues(4, 4, DESC) === 0).toEqual(true);
    expect(compareStatValues(null, null, ASC) === 0).toEqual(true);
  });
});
