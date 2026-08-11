import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_COLUMNS, DEFAULT_STAT_WEIGHTS } from './projection-defaults';
import { SCORING_STAT_KEYS, ScoringStatKey } from '../models/stat-key.model';

/**
 * The stats deliberately left at zero, and the reason each one is there. Anything not listed
 * has to carry a weight: a column added from the header menu that contributes nothing looks
 * broken, which is exactly how the ESPN-only stats behaved before they were given values.
 */
const INTENTIONALLY_UNWEIGHTED: Record<string, string> = {
  toi: 'held in seconds, so any per-unit weight swamps every other stat',
  shifts: 'four figures over a season, same magnitude problem as toi',
  gaa: 'a rate, not something accumulated',
  svPct: 'a rate, not something accumulated',
  winPct: 'a rate, not something accumulated',
  points: 'a composite of goals and assists, which are weighted separately',
  l: 'happens to a player rather than being produced by one',
  otl: 'happens to a player rather than being produced by one',
  sa: 'happens to a player rather than being produced by one',
  gs: 'happens to a player rather than being produced by one',
};

describe('DEFAULT_STAT_WEIGHTS', () => {
  it('covers every scoring stat the model knows about', () => {
    const missing = SCORING_STAT_KEYS.filter((statKey) => !(statKey in DEFAULT_STAT_WEIGHTS));
    expect(missing).toEqual([]);
  });

  it('leaves a stat at zero only for a documented reason', () => {
    const unexplainedZeroes = SCORING_STAT_KEYS.filter(
      (statKey) => DEFAULT_STAT_WEIGHTS[statKey] === 0 && !(statKey in INTENTIONALLY_UNWEIGHTED),
    );
    expect(unexplainedZeroes).toEqual([]);
  });

  it('scores the special-teams and bonus categories ESPN leagues use', () => {
    const espnOnly: ScoringStatKey[] = ['stpg', 'stpa', 'stp', 'hatTricks', 'defPoints'];
    const unscored = espnOnly.filter((statKey) => DEFAULT_STAT_WEIGHTS[statKey] === 0);
    expect(unscored).toEqual([]);
  });

  it('weights a points category the same as its power-play equivalent', () => {
    expect(DEFAULT_STAT_WEIGHTS.shp).toEqual(DEFAULT_STAT_WEIGHTS.ppp);
    expect(DEFAULT_STAT_WEIGHTS.stp).toEqual(DEFAULT_STAT_WEIGHTS.ppp);
    expect(DEFAULT_STAT_WEIGHTS.defPoints).toEqual(DEFAULT_STAT_WEIGHTS.ppp);
    expect(DEFAULT_STAT_WEIGHTS.stpg).toEqual(DEFAULT_STAT_WEIGHTS.ppg);
    expect(DEFAULT_STAT_WEIGHTS.stpa).toEqual(DEFAULT_STAT_WEIGHTS.ppa);
  });

  it('starts every column it activates by default with a non-zero weight', () => {
    const inertColumns = DEFAULT_SCORING_COLUMNS.filter(
      (statKey) => DEFAULT_STAT_WEIGHTS[statKey] === 0,
    );
    expect(inertColumns).toEqual([]);
  });
});
