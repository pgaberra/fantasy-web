import {
  GOALIE_SCORING_STAT_KEYS,
  SCORING_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  UTILITY_STAT_KEYS,
} from './stat-key.model';
import { STAT_LABELS } from '../pipes/stat-label.pipe';
import { STAT_FULL_NAMES } from '../pipes/stat-tooltip.pipe';
import { DEFAULT_STAT_WEIGHTS } from '../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';

/**
 * The stat vocabulary is spread across several maps, and TypeScript only catches a missing
 * entry where the map is typed as a full `Record`. A stat with no label renders as blank, so
 * these assert the whole set is covered wherever it has to be.
 */
describe('stat vocabulary', () => {
  const allKeys = [...UTILITY_STAT_KEYS, ...SCORING_STAT_KEYS];

  it('gives every stat a column label', () => {
    expect(allKeys.filter((key) => !STAT_LABELS[key])).toEqual([]);
  });

  it('gives every stat a full name for its tooltip', () => {
    expect(allKeys.filter((key) => !STAT_FULL_NAMES[key])).toEqual([]);
  });

  it('gives every scoring stat a default weight and decimal setting', () => {
    expect(SCORING_STAT_KEYS.filter((key) => DEFAULT_STAT_WEIGHTS[key] === undefined)).toEqual([]);
    expect(SCORING_STAT_KEYS.filter((key) => DEFAULT_DECIMAL_SETTINGS[key] === undefined)).toEqual(
      [],
    );
  });

  it('lists time on ice for skaters and goalies without repeating it', () => {
    expect(SKATER_SCORING_STAT_KEYS).toContain('toi');
    expect(GOALIE_SCORING_STAT_KEYS).toContain('toi');
    expect(SCORING_STAT_KEYS.filter((key) => key === 'toi').length).toEqual(1);
  });

  it('carries the stats only ESPN scores', () => {
    expect(SKATER_SCORING_STAT_KEYS).toContain('hatTricks');
    expect(SKATER_SCORING_STAT_KEYS).toContain('shifts');
    expect(GOALIE_SCORING_STAT_KEYS).toContain('otl');
  });
});
