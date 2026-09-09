import { describe, expect, it } from 'vitest';
import { readableDecimalSettings } from './model-decimals';
import { DEFAULT_DECIMAL_SETTINGS } from './model';
import { Projection } from '../../models/projection.model';

function skater(scoring: Record<string, number>, utility: Record<string, number> = {}): Projection {
  return {
    type: 'skater',
    playerId: 1,
    stats: { scoring, utility },
  } as unknown as Projection;
}

describe('readableDecimalSettings', () => {
  it('leaves a board of whole numbers exactly as it found it', () => {
    const settings = readableDecimalSettings(
      [skater({ goals: 48, assists: 90 }, { gp: 82 })],
      DEFAULT_DECIMAL_SETTINGS,
      true,
    );

    // The same object, not a copy: nothing downstream should recompute over this.
    expect(settings).toBe(DEFAULT_DECIMAL_SETTINGS);
  });

  it('gives a decimal place to the columns the model projects in fractions', () => {
    const settings = readableDecimalSettings(
      [skater({ goals: 49.43, assists: 90 }, { gp: 78.6 })],
      DEFAULT_DECIMAL_SETTINGS,
      true,
    );

    expect(settings.goals).toEqual(1);
    expect(settings.gp).toEqual(1);
    // Whole in every row, so it stays whole.
    expect(settings.assists).toEqual(0);
  });

  it('leaves a column that already shows more decimals alone', () => {
    const settings = readableDecimalSettings(
      [skater({ shPct: 15.72, goals: 49.4 })],
      DEFAULT_DECIMAL_SETTINGS,
      true,
    );

    expect(settings.shPct).toEqual(DEFAULT_DECIMAL_SETTINGS.shPct);
  });

  it('says nothing about time on ice, which is written mm:ss', () => {
    const settings = readableDecimalSettings(
      [skater({}, { toi: 1380.4 })],
      DEFAULT_DECIMAL_SETTINGS,
      true,
    );

    expect(settings.toi).toEqual(0);
  });

  /** Someone who set a column's decimals has answered the question this asks. */
  it('does not touch settings the reader chose', () => {
    const chosen = { ...DEFAULT_DECIMAL_SETTINGS, goals: 0 };

    const settings = readableDecimalSettings([skater({ goals: 49.4 })], chosen, false);

    expect(settings).toBe(chosen);
    expect(settings.goals).toEqual(0);
  });
});
