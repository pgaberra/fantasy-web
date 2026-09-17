import { Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { Player } from '../../models/player.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  StatKey,
} from '../../models/stat-key.model';
import { STAT_FULL_NAMES } from '../../pipes/stat-tooltip.pipe';
import { ColumnRole, findHeadingRow } from './spreadsheet-columns';
import { buildImportPlan, ImportPlan, proposeColumnRoles, RowChoices } from './spreadsheet-import';
import { PlayerMatcher } from './spreadsheet-players';
import {
  Cell,
  readPastedCells,
  readSpreadsheetFile,
  SpreadsheetReadError,
  SpreadsheetSheet,
} from './spreadsheet-table';

/** What a column select's value can be: a stat key, `name`, `team`, `position`, or empty for skip. */
type RoleValue = StatKey | 'name' | 'team' | 'position' | '';

export interface ColumnOption {
  readonly value: RoleValue;
  readonly label: string;
}

export interface ColumnRow {
  readonly index: number;
  readonly heading: string;
  readonly sample: string;
  readonly value: RoleValue;
}

const READ_ERRORS: Record<SpreadsheetReadError['reason'], string> = {
  'legacy-xls': 'This is an old .xls file. Save it as .xlsx or .csv and try again.',
  unsupported: 'Choose an .xlsx, .csv or .tsv file.',
  unreadable: "Couldn't read this file. Save it as .xlsx or .csv and try again.",
  empty: 'This file has no rows to import.',
};

/** A sheet the dialog has read and the user has confirmed, with the name to save it under. */
export interface SpreadsheetImport {
  readonly plan: ImportPlan;
  readonly name: string;
}

const PASTED_NAME = 'Spreadsheet import';
/** The longest name the server stores for a projection. */
export const MAX_NAME_LENGTH = 100;

/** "Apples & Ginos 2024-25.xlsx" as "Apples & Ginos 2024-25". */
function nameFromFile(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '').trim();
  return (withoutExtension || PASTED_NAME).slice(0, MAX_NAME_LENGTH);
}

/** Goalies' own stats, after the skaters' and the two that both have. */
const GOALIE_ONLY = GOALIE_SCORING_STAT_KEYS.filter((key) => key !== 'toi');

/**
 * Brings a projection kept in a spreadsheet into this one: a file (.xlsx, .csv, .tsv) or cells
 * pasted from Excel or Google Sheets. The sheet is read in the browser and never uploaded.
 *
 * A sheet is laid out however its author liked, so nothing is imported on a guess the user has
 * not seen: the dialog proposes a heading row and a meaning for each column, shows how many
 * players that finds, and lists the names it could not place before anything changes. Only the
 * mapped stats of the matched players are written, and the table's Undo takes the whole import
 * back in one step.
 */
@Component({
  selector: 'app-spreadsheet-import-dialog',
  imports: [IconComponent, LoadingIndicatorComponent],
  templateUrl: './spreadsheet-import-dialog.html',
  styleUrl: './spreadsheet-import-dialog.css',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class SpreadsheetImportDialogComponent {
  readonly players = input.required<readonly Player[]>();
  /** Set by the host while it saves the import, so the dialog can show it is waiting. */
  readonly saving = input(false);
  /** Why the host could not save the import, shown beside the button that tried. */
  readonly saveError = input<string | null>(null);
  readonly closed = output<void>();
  readonly imported = output<SpreadsheetImport>();

  /** What the imported board is called: the file's name, or a plain one for pasted cells. */
  readonly name = signal('');

  readonly step = signal<'source' | 'columns'>('source');
  readonly reading = signal(false);
  readonly readError = signal<string | null>(null);
  readonly pasted = signal('');

  readonly sheets = signal<SpreadsheetSheet[]>([]);
  readonly sheetIndex = signal(0);
  readonly headingRow = signal(0);
  readonly roles = signal<(ColumnRole | null)[]>([]);
  readonly showUnmatched = signal(false);
  /** What the user picked for the rows the dialog asks about, keyed by the row's place. */
  readonly choices = signal<RowChoices>(new Map());
  readonly showRespelled = signal(false);

  private readonly matcher = computed(() => new PlayerMatcher(this.players()));

  readonly sheet = computed<SpreadsheetSheet | null>(
    () => this.sheets()[this.sheetIndex()] ?? null,
  );
  private readonly rows = computed<Cell[][]>(() => this.sheet()?.rows ?? []);
  readonly rowCount = computed(() => this.rows().length);

  readonly columnOptions: readonly ColumnOption[] = [
    { value: '', label: "Don't import" },
    { value: 'name', label: 'Player name' },
    { value: 'team', label: 'Team' },
    { value: 'position', label: 'Position' },
    ...[...SKATER_UTILITY_STAT_KEYS, ...SKATER_SCORING_STAT_KEYS, ...GOALIE_ONLY].map((key) => ({
      value: key,
      label: STAT_FULL_NAMES[key],
    })),
  ];

  readonly columns = computed<ColumnRow[]>(() => {
    const rows = this.rows();
    const headingRow = this.headingRow();
    const headings = rows[headingRow] ?? [];
    const data = rows.slice(headingRow + 1);
    return this.roles()
      .map((role, index) => ({
        index,
        heading: text(headings[index]),
        sample: data
          .map((row) => row[index])
          .filter((cell) => (cell ?? null) !== null)
          .slice(0, 3)
          .map(text)
          .join(', '),
        value: roleValue(role),
      }))
      .filter((column) => column.heading || column.sample);
  });

  readonly hasNameColumn = computed(() => this.roles().some((role) => role?.kind === 'name'));
  readonly statCount = computed(() => this.roles().filter((role) => role?.kind === 'stat').length);

  readonly plan = computed<ImportPlan | null>(() =>
    this.hasNameColumn()
      ? buildImportPlan(
          this.rows(),
          this.headingRow(),
          this.roles(),
          this.matcher(),
          this.choices(),
        )
      : null,
  );

  readonly notFound = computed(() => this.plan()?.notFound ?? []);
  readonly ambiguous = computed(() => this.plan()?.ambiguous ?? []);
  readonly respelled = computed(() => this.plan()?.respelled ?? []);

  readonly canImport = computed(
    () => (this.plan()?.stats.size ?? 0) > 0 && this.name().trim().length > 0,
  );

  async onFilePicked(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    // Cleared so picking the same file again, after fixing it, still fires a change.
    inputElement.value = '';
    if (!file) {
      return;
    }
    this.reading.set(true);
    this.readError.set(null);
    try {
      this.open(await readSpreadsheetFile(file));
      this.name.set(nameFromFile(file.name));
    } catch (error) {
      this.readError.set(readErrorMessage(error));
    } finally {
      this.reading.set(false);
    }
  }

  onPasteInput(event: Event): void {
    this.pasted.set((event.target as HTMLTextAreaElement).value);
  }

  usePasted(): void {
    this.readError.set(null);
    try {
      this.open(readPastedCells(this.pasted()));
      this.name.set(PASTED_NAME);
    } catch (error) {
      this.readError.set(readErrorMessage(error));
    }
  }

  private open(sheets: SpreadsheetSheet[]): void {
    this.sheets.set(sheets);
    // The sheet naming the most players, so a workbook that opens on instructions or keeps a short
    // goalie list beside the skaters starts on the projection.
    const matcher = this.matcher();
    const counts = sheets.map((sheet) => matcher.countMatches(sheet.rows.flat()));
    this.selectSheet(counts.indexOf(Math.max(...counts)));
    this.step.set('columns');
  }

  selectSheet(index: number): void {
    this.sheetIndex.set(index);
    const rows = this.rows();
    const headingRow = findHeadingRow(rows);
    this.headingRow.set(headingRow);
    this.roles.set(proposeColumnRoles(rows, headingRow, this.matcher()));
    this.showUnmatched.set(false);
    this.choices.set(new Map());
  }

  onSheetChange(event: Event): void {
    this.selectSheet(Number((event.target as HTMLSelectElement).value));
  }

  onHeadingRowChange(event: Event): void {
    const row = Math.round(Number((event.target as HTMLInputElement).value));
    if (!Number.isFinite(row) || row < 1 || row > this.rowCount()) {
      return;
    }
    this.headingRow.set(row - 1);
    this.roles.set(proposeColumnRoles(this.rows(), row - 1, this.matcher()));
    this.choices.set(new Map());
  }

  /** Picks the player a row means, or none, which leaves the row out of the import. */
  onChoice(row: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.choices.update((choices) => new Map(choices).set(row, value ? Number(value) : null));
  }

  /** How a candidate reads in the picker: enough to tell two players of one name apart. */
  candidateLabel(player: Player): string {
    const position = player.type === 'goalie' ? 'G' : [...player.positions].join(', ');
    return [player.name, player.teamAbbrev, position].filter(Boolean).join(' · ');
  }

  onColumnRoleChange(column: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as RoleValue;
    const role = roleFrom(value);
    this.roles.update((roles) =>
      roles.map((current, index) => {
        if (index === column) {
          return role;
        }
        // One column per role: choosing a column for a stat, the names or the team takes the job
        // away from whichever column had it.
        return role && current && roleValue(current) === value ? null : current;
      }),
    );
  }

  back(): void {
    this.step.set('source');
    this.readError.set(null);
  }

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  confirm(): void {
    const plan = this.plan();
    const name = this.name().trim();
    if (plan && plan.stats.size && name && !this.saving()) {
      this.imported.emit({ plan, name });
    }
  }
}

function text(cell: Cell | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell);
}

function roleValue(role: ColumnRole | null): RoleValue {
  if (!role) {
    return '';
  }
  return role.kind === 'stat' ? role.stat : role.kind;
}

function roleFrom(value: RoleValue): ColumnRole | null {
  if (value === '') {
    return null;
  }
  if (value === 'name' || value === 'team' || value === 'position') {
    return { kind: value };
  }
  return { kind: 'stat', stat: value };
}

function readErrorMessage(error: unknown): string {
  return error instanceof SpreadsheetReadError ? READ_ERRORS[error.reason] : READ_ERRORS.unreadable;
}
