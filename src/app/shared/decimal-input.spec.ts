import { describe, it, expect } from 'vitest';
import { parseDecimalInput, steppedDecimalInput } from './decimal-input';

describe('decimal-input', () => {
  describe('parseDecimalInput', () => {
    it('reads a decimal point, which is how the app writes one', () => {
      expect(parseDecimalInput('4.5')).toBeCloseTo(4.5, 10);
      expect(parseDecimalInput('-1')).toEqual(-1);
    });

    it('reads a typed comma as the point it stands in for', () => {
      expect(parseDecimalInput('4,5')).toBeCloseTo(4.5, 10);
      expect(parseDecimalInput('0,33')).toBeCloseTo(0.33, 10);
    });

    it('reads an empty or unfinished field as zero, the way a number field reported it', () => {
      expect(parseDecimalInput('')).toEqual(0);
      expect(parseDecimalInput('   ')).toEqual(0);
      expect(parseDecimalInput('-')).toEqual(0);
      expect(parseDecimalInput('abc')).toEqual(0);
    });
  });

  describe('steppedDecimalInput', () => {
    it('steps up and down by the field\u2019s own step', () => {
      expect(steppedDecimalInput('4.5', 'ArrowUp', 0.01)).toBeCloseTo(4.51, 10);
      expect(steppedDecimalInput('4.5', 'ArrowDown', 0.01)).toBeCloseTo(4.49, 10);
      expect(steppedDecimalInput('369', 'ArrowUp', 1)).toEqual(370);
    });

    it('steps a field holding a comma, since that is a value the field accepts', () => {
      expect(steppedDecimalInput('4,5', 'ArrowUp', 0.1)).toBeCloseTo(4.6, 10);
    });

    it('leaves every other key to the field', () => {
      expect(steppedDecimalInput('4.5', 'a', 0.01)).toBeNull();
      expect(steppedDecimalInput('4.5', 'Enter', 0.01)).toBeNull();
    });
  });
});
