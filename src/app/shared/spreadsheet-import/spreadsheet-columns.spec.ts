import { describe, expect, it } from 'vitest';
import { convertColumn, findHeadingRow, guessColumnRoles, numberFrom } from './spreadsheet-columns';

describe('spreadsheet-columns', () => {
  it('finds headings under a title, instructions and a row of weights', () => {
    const rows = [
      ['To use this sheet, make a copy first.'],
      ['Category used?', null, 'Yes', 'Yes'],
      ['Weight', null, 4.5, 3],
      [null, 'Team', 'GP', 'G', 'A', 'PTS'],
      ['Nathan MacKinnon', 'COL', 82, 44.7, 84.4, 129.2],
    ];
    expect(findHeadingRow(rows)).toBe(3);
  });

  it('guesses each column once, so the weighted copies of the stats are left out', () => {
    const headings = ['Player', 'Team', 'Proj Pos', 'GP', 'G', 'A', 'S%', 'ATOI', 'G', 'A', 'FPTS'];
    expect(guessColumnRoles(headings, headings.length)).toEqual([
      { kind: 'name' },
      { kind: 'team' },
      { kind: 'position' },
      { kind: 'stat', stat: 'gp' },
      { kind: 'stat', stat: 'goals' },
      { kind: 'stat', stat: 'assists' },
      { kind: 'stat', stat: 'shPct' },
      { kind: 'stat', stat: 'toiPerGame' },
      null,
      null,
      null,
    ]);
  });

  it('knows the goalie headings', () => {
    const headings = ['Name', 'GS', 'W', 'L', 'OTL', 'GAA', 'SV%', 'SO'];
    expect(guessColumnRoles(headings, headings.length)).toEqual([
      { kind: 'name' },
      { kind: 'stat', stat: 'gs' },
      { kind: 'stat', stat: 'w' },
      { kind: 'stat', stat: 'l' },
      { kind: 'stat', stat: 'otl' },
      { kind: 'stat', stat: 'gaa' },
      { kind: 'stat', stat: 'svPct' },
      { kind: 'stat', stat: 'sho' },
    ]);
  });

  it('reads decimal commas, percent signs and blanks', () => {
    expect(numberFrom('4,5')).toBe(4.5);
    expect(numberFrom('11.1%')).toBeCloseTo(11.1);
    expect(numberFrom('+12')).toBe(12);
    expect(numberFrom('-3')).toBe(-3);
    expect(numberFrom('')).toBeNull();
    expect(numberFrom('n/a')).toBeNull();
    expect(numberFrom(null)).toBeNull();
    expect(numberFrom(82)).toBe(82);
  });

  it('holds shooting percentage as a percentage and save percentage as a share', () => {
    expect(convertColumn('shPct', [0.111, 0.146, null])).toEqual([11.1, 14.6, null]);
    expect(convertColumn('shPct', [11.1, 0.5])).toEqual([11.1, 0.5]);
    expect(convertColumn('svPct', [91.5, 90.2])).toEqual([0.915, 0.902]);
    expect(convertColumn('svPct', [0.915])).toEqual([0.915]);
  });

  it('holds time on ice per game in seconds, whichever way the sheet wrote it', () => {
    expect(convertColumn('toiPerGame', [22.25, 21.5])).toEqual([1335, 1290]);
    expect(convertColumn('toiPerGame', ['22:15', '9:05'])).toEqual([1335, 545]);
    expect(convertColumn('toiPerGame', [1335])).toEqual([1335]);
    // 22:15 typed into a time cell: Excel stores 22 hours 15 minutes as a fraction of a day.
    expect(convertColumn('toiPerGame', [(22 * 60 + 15) / 1440])).toEqual([1335]);
    // Written as 0:22:15, a real fraction of a day in minutes and seconds.
    expect(convertColumn('toiPerGame', [1335 / 86400])).toEqual([1335]);
  });

  it('reads a season of time on ice in minutes unless it is already seconds', () => {
    expect(convertColumn('toi', [1640, 900])).toEqual([98400, 54000]);
    expect(convertColumn('toi', [98400])).toEqual([98400]);
  });
});
