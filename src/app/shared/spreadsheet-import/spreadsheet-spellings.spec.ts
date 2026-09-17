import { describe, expect, it } from 'vitest';
import { editDistance, spellingKey } from './spreadsheet-spellings';

describe('spreadsheet-spellings', () => {
  it('gives a short first name the key of its long form', () => {
    expect(spellingKey('tommy novak')).toBe(spellingKey('thomas novak'));
    expect(spellingKey('nick paul')).toBe(spellingKey('nicholas paul'));
    expect(spellingKey('sam montembeault')).toBe(spellingKey('samuel montembeault'));
  });

  it('folds the letters Russian names are transliterated with differently', () => {
    expect(spellingKey('yegor chinakhov')).toBe(spellingKey('egor chinakhov'));
    expect(spellingKey('pavel dorofyev')).toBe(spellingKey('pavel dorofeyev'));
    expect(spellingKey('sergey bobrovsky')).toBe(spellingKey('sergei bobrovsky'));
    expect(spellingKey('alexey toropchenko')).toBe(spellingKey('aleksei toropchenko'));
    expect(spellingKey('ilia sorokin')).toBe(spellingKey('ilya sorokin'));
  });

  it('keeps different players apart', () => {
    expect(spellingKey('jack hughes')).not.toBe(spellingKey('luke hughes'));
    expect(spellingKey('brady tkachuk')).not.toBe(spellingKey('matthew tkachuk'));
  });

  it('only shortens the first of several words', () => {
    // "Tom" is a surname here, not a Thomas.
    expect(spellingKey('tom')).toBe('tom');
    expect(spellingKey('jake tom')).toBe(spellingKey('jacob tom'));
  });

  it('counts single-letter edits, swaps included, and stops past the limit', () => {
    expect(editDistance('crosby', 'crosbie', 2)).toBe(2);
    expect(editDistance('ovechkin', 'ovechkni', 2)).toBe(1);
    expect(editDistance('same', 'same', 1)).toBe(0);
    expect(editDistance('gretzky', 'mcdavid', 2)).toBe(3);
  });
});
