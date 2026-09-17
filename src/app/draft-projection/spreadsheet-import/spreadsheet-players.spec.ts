import { describe, expect, it } from 'vitest';
import { nameKey, PlayerMatcher, positionsFrom, teamKey } from './spreadsheet-players';
import { POOL } from './spreadsheet-test-players';

describe('spreadsheet-players', () => {
  const matcher = new PlayerMatcher(POOL);
  const idOf = (name: string, team?: string, position?: string) => {
    const result = matcher.match(name, team ?? null, position ?? null);
    if (result.kind === 'matched' && result.respelled) {
      return `respelled ${result.player.id}`;
    }
    return result.kind === 'matched' ? result.player.id : result.kind;
  };

  it('reads a name without case, accents, dots or hyphens, and turns "Last, First" round', () => {
    expect(nameKey('Tim Stützle')).toBe('tim stutzle');
    expect(nameKey('  Pierre-Luc  Dubois ')).toBe('pierre luc dubois');
    expect(nameKey('MacKinnon, Nathan')).toBe('nathan mackinnon');
    expect(nameKey("J.T. O'Connor")).toBe('jt oconnor');
  });

  it('folds the club abbreviations sources spell differently', () => {
    expect(teamKey('tb')).toBe('TBL');
    expect(teamKey('TBL')).toBe('TBL');
    expect(teamKey(' ')).toBeNull();
  });

  it('matches the spellings a sheet uses for the same player', () => {
    expect(idOf('Nathan Mackinnon')).toBe(1);
    expect(idOf('Tim Stutzle')).toBe(2);
    expect(idOf('Pierre Luc Dubois')).toBe(8);
    expect(idOf('Hughes, Jack')).toBe(6);
  });

  it('matches a shortened first name when the surname leaves one candidate', () => {
    expect(idOf('Mitch Marner')).toBe('respelled 3');
    expect(idOf('M. Marner')).toBe('respelled 3');
  });

  it('uses the club only to tell two players of one name apart', () => {
    expect(idOf('Sebastian Aho', 'CAR')).toBe(4);
    expect(idOf('Sebastian Aho', 'NYI')).toBe(5);
    expect(idOf('Sebastian Aho')).toBe('ambiguous');
    // A club the pool no longer agrees with does not cost a match the name makes alone.
    expect(idOf('Tim Stützle', 'CHI')).toBe(2);
  });

  it('reads the positions a sheet writes, depth-chart spellings included', () => {
    expect([...positionsFrom('C1')]).toEqual(['C']);
    expect([...positionsFrom('LD2')]).toEqual(['D']);
    expect([...positionsFrom('LW/RW')]).toEqual(['LW', 'RW']);
    expect([...positionsFrom('F')]).toEqual(['C', 'LW', 'RW']);
    expect(positionsFrom(null).size).toBe(0);
  });

  it('tells two players of one name on one club apart by position', () => {
    expect(idOf('Elias Pettersson', 'VAN', 'C2')).toBe(10);
    expect(idOf('Elias Pettersson', 'VAN', 'LD1')).toBe(11);
    expect(idOf('Elias Pettersson', 'VAN')).toBe('ambiguous');
    // A position neither plays narrows nothing, rather than ruling both out.
    expect(idOf('Elias Pettersson', 'VAN', 'G')).toBe('ambiguous');
  });

  it('does not take one brother for the other', () => {
    expect(idOf('Quinn Hughes', 'NJD')).toBe('not-found');
    expect(idOf('J Hughes', 'NJD')).toBe('respelled 6');
  });

  it('matches another spelling of a name and says it did', () => {
    expect(idOf('Yegor Chinakhov')).toBe('respelled 12');
    expect(idOf('Tommy Novak')).toBe('respelled 13');
    expect(idOf('Egor Chinakov')).toBe('respelled 12');
    expect(idOf('Egor Chinakhov')).toBe(12);
  });

  it('leaves a name that is nobody in the pool unmatched', () => {
    expect(idOf('Wayne Gretzky', 'EDM')).toBe('not-found');
    expect(idOf('Marner')).toBe('not-found');
    expect(idOf('')).toBe('not-found');
  });
});
