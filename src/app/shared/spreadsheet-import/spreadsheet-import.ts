import { Player } from '../../models/player.model';
import { Projection } from '../../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  StatKey,
} from '../../models/stat-key.model';
import { ColumnRole, convertColumn, guessColumnRoles } from './spreadsheet-columns';
import { PlayerMatcher } from './spreadsheet-players';
import { reconcileImportedLine } from './spreadsheet-reconcile';
import { Cell } from './spreadsheet-table';

/** The stats read for one player, in the units the projection stores. */
export type ImportedStats = Partial<Record<StatKey, number>>;

export interface AmbiguousRow {
  /** The row's place among the sheet's named rows, which is what a choice is keyed by. */
  readonly row: number;
  readonly name: string;
  readonly candidates: readonly Player[];
}

/** A row matched to a player whose name the sheet spells differently. */
export interface RespelledRow {
  readonly row: number;
  readonly name: string;
  readonly player: Player;
}

/**
 * What the user decided for a row the dialog asked about, keyed by the row's place: a player id,
 * or null for "leave it out". A row with no entry takes the plan's own reading.
 */
export type RowChoices = ReadonlyMap<number, number | null>;

export interface ImportPlan {
  /** Per pool player, the stats the sheet gives. Only players with at least one value appear. */
  readonly stats: ReadonlyMap<number, ImportedStats>;
  /** Names on the sheet with no player in the pool, in sheet order. */
  readonly notFound: readonly string[];
  /**
   * Rows whose name fits more than one player even after the club and position. None of them is
   * guessed; each is imported only once the user picks the player (`choices`).
   */
  readonly ambiguous: readonly AmbiguousRow[];
  /**
   * Rows matched through a different spelling (Tommy for Thomas, Yegor for Egor). They are imported
   * unless the user leaves them out, and listed so the user can see what each name was taken for.
   */
  readonly respelled: readonly RespelledRow[];
  /** Rows naming a player an earlier row already gave; the first row wins. */
  readonly duplicates: readonly string[];
  /** Rows on the sheet that carry a name. */
  readonly rowCount: number;
}

/**
 * The sheet's columns as the dialog first proposes them: the headings' own guess, and when no
 * heading says which column holds names, the column that names the most pool players.
 */
export function proposeColumnRoles(
  rows: Cell[][],
  headingRow: number,
  matcher: PlayerMatcher,
): (ColumnRole | null)[] {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const roles = guessColumnRoles(rows[headingRow] ?? [], columnCount);
  if (!roles.some((role) => role?.kind === 'name')) {
    const sample = rows.slice(headingRow + 1, headingRow + 101);
    let best = -1;
    let bestCount = 0;
    for (let column = 0; column < columnCount; column++) {
      if (roles[column]) {
        continue;
      }
      const count = matcher.countMatches(sample.map((row) => row[column] ?? null));
      if (count > bestCount) {
        best = column;
        bestCount = count;
      }
    }
    if (best >= 0) {
      roles[best] = { kind: 'name' };
    }
  }
  return roles;
}

export function buildImportPlan(
  rows: Cell[][],
  headingRow: number,
  roles: readonly (ColumnRole | null)[],
  matcher: PlayerMatcher,
  choices: RowChoices = new Map(),
): ImportPlan {
  const nameColumn = roles.findIndex((role) => role?.kind === 'name');
  const teamColumn = roles.findIndex((role) => role?.kind === 'team');
  const positionColumn = roles.findIndex((role) => role?.kind === 'position');
  const dataRows = rows.slice(headingRow + 1).filter((row) => {
    const name = nameColumn >= 0 ? row[nameColumn] : null;
    return typeof name === 'string' && name.trim() !== '';
  });

  const converted: { stat: StatKey; values: (number | null)[] }[] = [];
  roles.forEach((role, column) => {
    if (role?.kind === 'stat') {
      const cells = dataRows.map((row) => row[column] ?? null);
      converted.push({ stat: role.stat, values: convertColumn(role.stat, cells) });
    }
  });

  const stats = new Map<number, ImportedStats>();
  const seen = new Set<number>();
  const notFound: string[] = [];
  const ambiguous: AmbiguousRow[] = [];
  const respelled: RespelledRow[] = [];
  const duplicates: string[] = [];

  dataRows.forEach((row, index) => {
    const name = String(row[nameColumn]).trim();
    const result = matcher.match(
      name,
      teamColumn >= 0 ? row[teamColumn] : null,
      positionColumn >= 0 ? row[positionColumn] : null,
    );
    if (result.kind === 'not-found') {
      notFound.push(name);
      return;
    }
    let player: Player;
    if (result.kind === 'ambiguous') {
      ambiguous.push({ row: index, name, candidates: result.candidates });
      const chosen = result.candidates.find((candidate) => candidate.id === choices.get(index));
      if (!chosen) {
        return;
      }
      player = chosen;
    } else {
      player = result.player;
      if (result.respelled) {
        respelled.push({ row: index, name, player });
        if (choices.get(index) === null) {
          return;
        }
      }
    }
    if (seen.has(player.id)) {
      duplicates.push(name);
      return;
    }
    seen.add(player.id);
    const line: ImportedStats = {};
    for (const { stat, values } of converted) {
      const value = values[index];
      if (value !== null && Number.isFinite(value) && holdsStat(player.type, stat)) {
        line[stat] = value;
      }
    }
    if (Object.keys(line).length) {
      stats.set(player.id, line);
    }
  });

  return { stats, notFound, ambiguous, respelled, duplicates, rowCount: dataRows.length };
}

const SKATER_STATS: ReadonlySet<string> = new Set([
  ...SKATER_SCORING_STAT_KEYS,
  ...SKATER_UTILITY_STAT_KEYS,
]);
const GOALIE_STATS: ReadonlySet<string> = new Set([
  ...GOALIE_SCORING_STAT_KEYS,
  ...GOALIE_UTILITY_STAT_KEYS,
]);

/** Whether a line of this type has the stat: a skater's sheet can name a goalie, and hits do not fit. */
export function holdsStat(type: Player['type'], stat: StatKey): boolean {
  return (type === 'skater' ? SKATER_STATS : GOALIE_STATS).has(stat);
}

/**
 * The projection with the sheet's values written over it. The stats the sheet gives change, and so
 * do the ones defined by them (see `reconcileImportedLine`); every other stat, and every player the
 * sheet does not name, keeps what it had. Games played and time on ice never rescale the counting
 * stats, as a hand edit of them would: the sheet's goals were projected over the sheet's games.
 */
export function applyImportedStats(
  projections: readonly Projection[],
  imported: ReadonlyMap<number, ImportedStats>,
): Projection[] {
  return projections.map((projection) => {
    const line = imported.get(projection.playerId);
    if (!line) {
      return projection;
    }
    const scoring: Record<string, number> = { ...projection.stats.scoring };
    const utility: Record<string, number> = { ...projection.stats.utility };
    const written = new Set<StatKey>();
    for (const [stat, value] of Object.entries(line) as [StatKey, number][]) {
      if (!holdsStat(projection.type, stat)) {
        continue;
      }
      written.add(stat);
      if ((SKATER_UTILITY_STAT_KEYS as readonly string[]).includes(stat)) {
        utility[stat] = value;
      } else {
        scoring[stat] = value;
      }
    }
    reconcileImportedLine(projection.type, scoring, utility, written, {
      scoring: projection.stats.scoring,
      gp: projection.stats.utility.gp,
    });
    return { ...projection, stats: { scoring, utility } } as Projection;
  });
}

/**
 * Every pool player's line for a board made from a spreadsheet: the sheet's stats for the players
 * it names, and nothing for everyone else.
 *
 * A board imported from a sheet is the sheet's numbers, so a player it leaves out starts empty
 * rather than on last season's line, which would rank him among projections nobody made. The
 * board still holds the whole pool, as every board does, so a draft against it can take anyone.
 */
export function linesFromSheet(
  players: readonly Player[],
  imported: ReadonlyMap<number, ImportedStats>,
): Projection[] {
  const empty = players.map((player): Projection =>
    player.type === 'skater'
      ? ({
          type: 'skater',
          playerId: player.id,
          stats: {
            utility: zeros(SKATER_UTILITY_STAT_KEYS),
            scoring: zeros(SKATER_SCORING_STAT_KEYS),
          },
        } as Projection)
      : ({
          type: 'goalie',
          playerId: player.id,
          stats: {
            utility: zeros(GOALIE_UTILITY_STAT_KEYS),
            scoring: zeros(GOALIE_SCORING_STAT_KEYS),
          },
        } as Projection),
  );
  return applyImportedStats(empty, imported);
}

function zeros(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}
