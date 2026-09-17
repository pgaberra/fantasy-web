/**
 * Reading a spreadsheet into rows of cells, in the browser.
 *
 * Nothing here reaches the server: the file is read where it was picked, and only the stats it
 * yields are saved, the same way a hand edit is. A spreadsheet is somebody else's layout, so this
 * layer promises no more than a grid: which row holds the headings, which column holds the names,
 * and what each column means are decided later, in the open, where the user can correct them.
 */

/** One cell as read: text, a number, or nothing. Dates and booleans arrive as text. */
export type Cell = string | number | null;

export interface SpreadsheetSheet {
  readonly name: string;
  readonly rows: Cell[][];
}

/** A file the reader refuses, with the reason the dialog words for the user. */
export class SpreadsheetReadError extends Error {
  constructor(readonly reason: 'legacy-xls' | 'unsupported' | 'unreadable' | 'empty') {
    super(reason);
    this.name = 'SpreadsheetReadError';
  }
}

/** Larger than any projection sheet by two orders of magnitude, and small enough to read at once. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** A league has about 1,500 players; past this a sheet is not a player list. */
export const MAX_ROWS = 5000;

/**
 * Every sheet in the file. `.xlsx` goes through `read-excel-file`, loaded only when one is picked
 * so the editor's bundle does not carry it; anything textual is split here.
 */
export async function readSpreadsheetFile(file: File): Promise<SpreadsheetSheet[]> {
  if (file.size > MAX_FILE_BYTES) {
    throw new SpreadsheetReadError('unreadable');
  }
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  if (extension === 'xls') {
    throw new SpreadsheetReadError('legacy-xls');
  }
  if (extension === 'xlsx') {
    return nonEmpty(await readXlsx(file));
  }
  if (['csv', 'tsv', 'txt'].includes(extension)) {
    return nonEmpty([{ name: file.name, rows: parseDelimitedText(await file.text()) }]);
  }
  throw new SpreadsheetReadError('unsupported');
}

/** Cells copied out of Excel or Google Sheets and pasted, which both put on the clipboard as TSV. */
export function readPastedCells(text: string): SpreadsheetSheet[] {
  return nonEmpty([{ name: 'Pasted cells', rows: parseDelimitedText(text) }]);
}

async function readXlsx(file: File): Promise<SpreadsheetSheet[]> {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    // The universal build, not the browser one: that one parses in a Web Worker, which buys
    // nothing for a file this size and would need its own allowance in the CSP.
    const { default: readXlsxFile } = await import('read-excel-file/universal');
    sheets = await readXlsxFile(file);
  } catch {
    throw new SpreadsheetReadError('unreadable');
  }
  return sheets.map((sheet) => ({
    name: sheet.sheet,
    rows: sheet.data.slice(0, MAX_ROWS).map((row) => row.map(toCell)),
  }));
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    // A cell formatted as a time is read as a date on Excel's epoch, and its clock is the value.
    // Typing 22:15 into Excel means 22 hours 15 minutes, but a sheet of ice times means minutes
    // and seconds, so a whole number of minutes is read one unit down.
    const hours = value.getUTCHours();
    const minutes = value.getUTCMinutes();
    const seconds = value.getUTCSeconds();
    if (hours && !seconds) {
      return `${hours}:${pad(minutes)}`;
    }
    return `${hours * 60 + minutes}:${pad(seconds)}`;
  }
  if (typeof value !== 'string' && typeof value !== 'boolean') {
    return null;
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function nonEmpty(sheets: SpreadsheetSheet[]): SpreadsheetSheet[] {
  const withRows = sheets.filter((sheet) => sheet.rows.some((row) => row.some((c) => c !== null)));
  if (!withRows.length) {
    throw new SpreadsheetReadError('empty');
  }
  return withRows;
}

/**
 * Splits CSV, TSV or semicolon-separated text into rows, honouring quoted fields. The delimiter is
 * whichever of tab, semicolon and comma splits the first lines most evenly: a clipboard is tabs,
 * a Swedish Excel saves semicolons, and everything else writes commas.
 */
export function parseDelimitedText(text: string): Cell[][] {
  const clean = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  let fieldWasQuoted = false;

  const endField = () => {
    const trimmed = fieldWasQuoted ? field : field.trim();
    row.push(trimmed === '' ? null : trimmed);
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length && rows.length < MAX_ROWS; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      quoted = true;
      fieldWasQuoted = true;
      field = '';
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') {
        i++;
      }
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    endRow();
  }
  // A trailing newline leaves one empty row behind, and blank lines carry nothing.
  return rows.filter((cells) => cells.some((cell) => cell !== null));
}

function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, 10);
  let best = ',';
  let bestScore = 0;
  for (const candidate of ['\t', ';', ',']) {
    const counts = lines.map((line) => line.split(candidate).length - 1);
    const rowsWithIt = counts.filter((count) => count > 0).length;
    // Rows that split, weighted by how many columns they split into: a comma inside a name
    // splits one row once, a real delimiter splits all of them many times.
    const score = rowsWithIt * Math.min(...counts.filter((c) => c > 0).concat([Infinity]));
    if (rowsWithIt && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
