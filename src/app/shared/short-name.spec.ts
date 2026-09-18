import { describe, expect, it } from 'vitest';
import { shortName, shortNames } from './short-name';

describe('shortName', () => {
  it('cuts the first name to its initial', () => {
    expect(shortName('Connor McDavid')).toEqual('C. McDavid');
    expect(shortName('Jack Hughes')).toEqual('J. Hughes');
  });

  it('keeps every word of a surname after the first name', () => {
    expect(shortName('Trevor van Riemsdyk')).toEqual('T. van Riemsdyk');
  });

  it('takes the first letter of a hyphenated first name', () => {
    expect(shortName('Pierre-Luc Dubois')).toEqual('P. Dubois');
  });

  it('leaves a first name that is already initials alone', () => {
    expect(shortName('J.T. Miller')).toBeNull();
  });

  it('has nothing to shorten in a single word', () => {
    expect(shortName('Sergeev')).toBeNull();
    expect(shortName('')).toBeNull();
  });
});

describe('shortNames', () => {
  it('gives each name its short form', () => {
    expect(shortNames(['Connor McDavid', 'Leon Draisaitl'])).toEqual(
      new Map([
        ['Connor McDavid', 'C. McDavid'],
        ['Leon Draisaitl', 'L. Draisaitl'],
      ]),
    );
  });

  /** "J. Staal" would name either, so neither gets it. */
  it('keeps the full name for two names that would share a short form', () => {
    const result = shortNames(['Jordan Staal', 'Jared Staal', 'Eric Staal']);

    expect(result.has('Jordan Staal')).toBe(false);
    expect(result.has('Jared Staal')).toBe(false);
    expect(result.get('Eric Staal')).toEqual('E. Staal');
  });

  /** The full name is as ambiguous as the short one, so shortening costs nothing. */
  it('shortens two players who share the whole name', () => {
    expect(shortNames(['Sebastian Aho', 'Sebastian Aho']).get('Sebastian Aho')).toEqual('S. Aho');
  });

  it('leaves out names with nothing to shorten', () => {
    expect(shortNames(['J.T. Miller']).size).toEqual(0);
  });
});
