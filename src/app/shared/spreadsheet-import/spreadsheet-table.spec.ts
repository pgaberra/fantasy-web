import { describe, expect, it } from 'vitest';
import { parseDelimitedText, readSpreadsheetFile, SpreadsheetReadError } from './spreadsheet-table';

describe('spreadsheet-table', () => {
  it('splits tab-separated text', () => {
    expect(parseDelimitedText('Player\tG\tA\r\nNathan MacKinnon\t44.7\t84.4\r\n')).toEqual([
      ['Player', 'G', 'A'],
      ['Nathan MacKinnon', '44.7', '84.4'],
    ]);
  });

  it('reads CSV with quoted fields holding commas and quotes', () => {
    expect(parseDelimitedText('Player,Team,G\n"MacKinnon, Nathan",COL,44\n"A ""B"" C",,3')).toEqual(
      [
        ['Player', 'Team', 'G'],
        ['MacKinnon, Nathan', 'COL', '44'],
        ['A "B" C', null, '3'],
      ],
    );
  });

  it('reads the semicolons a Swedish Excel saves, decimal commas and all', () => {
    expect(parseDelimitedText('Player;G;S%\nTim Stützle;31,5;12,1\n')).toEqual([
      ['Player', 'G', 'S%'],
      ['Tim Stützle', '31,5', '12,1'],
    ]);
  });

  it('drops blank lines and a byte-order mark', () => {
    expect(parseDelimitedText('﻿Player,G\n\n,\nA,1\n')).toEqual([
      ['Player', 'G'],
      ['A', '1'],
    ]);
  });

  it('refuses a file with nothing in it', async () => {
    const empty = new File([' ,\n\n'], 'empty.csv');
    await expect(readSpreadsheetFile(empty)).rejects.toBeInstanceOf(SpreadsheetReadError);
  });

  it('reads a CSV file and refuses the old .xls format and other files', async () => {
    const csv = new File(['Player,G\nA,1\n'], 'projection.csv');
    expect(await readSpreadsheetFile(csv)).toEqual([
      {
        name: 'projection.csv',
        rows: [
          ['Player', 'G'],
          ['A', '1'],
        ],
      },
    ]);
    await expect(readSpreadsheetFile(new File(['x'], 'old.xls'))).rejects.toMatchObject({
      reason: 'legacy-xls',
    });
    await expect(readSpreadsheetFile(new File(['x'], 'notes.tsv'))).rejects.toMatchObject({
      reason: 'unsupported',
    });
    await expect(readSpreadsheetFile(new File(['x'], 'broken.xlsx'))).rejects.toMatchObject({
      reason: 'unreadable',
    });
  });
});
