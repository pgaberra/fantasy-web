import { Projection } from '../../models/projection.model';
import { DecimalStatKey } from './model';

/**
 * How many decimals a column gets once its numbers have any. The model projects a season in
 * fractions — 49.4 goals, 78.6 games — and the defaults were written for last season's stats,
 * which are whole numbers by nature. One decimal is what the model's precision is worth reading:
 * it says the number was computed rather than counted, without printing noise nobody can use.
 */
const FRACTIONAL_DECIMALS = 1;

/**
 * Time on ice is written mm:ss, so a decimal place on it means nothing. Shifts come back from
 * the model already rounded, so the scan never reaches for one.
 */
const NOT_DECIMAL_STATS: ReadonlySet<string> = new Set(['toi']);

/** The most decimal places a column can be set to. */
export const MAX_DECIMAL_SETTING = 3;

/**
 * Whether a decimal setting changes anything about how the stat is written. Asked by every
 * control that offers one, so none of them offers a setting that does nothing.
 */
export function takesDecimals(statKey: DecimalStatKey): boolean {
  return !NOT_DECIMAL_STATS.has(statKey);
}

/** Whether a value carries anything a decimal place would show. */
function isFractional(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) > 1e-9;
}

/**
 * The decimals a board is actually read with: its own settings, except that a column holding
 * fractions is given a decimal place while the reader is still on the defaults.
 *
 * <p>The AI projection is the reason this exists. Its lines are fractional all the way through,
 * and shown at the defaults every one of them was rounded to a whole number — the model's whole
 * claim to accuracy printed away, and 49.4 goals scored as 49, since the ranking deliberately
 * scores what the table shows. A board of last season's stats is unaffected: whole numbers stay
 * whole, whatever the setting says.
 *
 * <p>Only while `useDefaults` is on. Someone who has set a column's decimals themselves has
 * answered this question, and the answer is theirs.
 */
export function readableDecimalSettings(
  projections: readonly Projection[],
  settings: Record<DecimalStatKey, number>,
  useDefaults: boolean,
): Record<DecimalStatKey, number> {
  if (!useDefaults) {
    return settings;
  }
  let derived: Record<DecimalStatKey, number> | null = null;
  for (const projection of projections) {
    for (const stats of [projection.stats.scoring, projection.stats.utility]) {
      for (const [key, value] of Object.entries(stats as Record<string, number>)) {
        // A stat with no decimal setting is not a column anything is written in.
        const held = derived ?? settings;
        if (!(key in held) || held[key as DecimalStatKey] >= FRACTIONAL_DECIMALS) continue;
        if (NOT_DECIMAL_STATS.has(key) || !isFractional(value)) continue;
        derived ??= { ...settings };
        derived[key as DecimalStatKey] = FRACTIONAL_DECIMALS;
      }
    }
  }
  // The same object back when nothing is fractional, so a board of whole numbers costs the
  // computeds downstream nothing at all.
  return derived ?? settings;
}
