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
import { Cell } from './spreadsheet-table';

/** The stats read for one player, in the units the projection stores. */
export type ImportedStats = Partial<Record<StatKey, number>>;

export interface ImportPlan {
  /** Per pool player, the stats the sheet gives. Only players with at least one value appear. */
  readonly stats: ReadonlyMap<number, ImportedStats>;
  /** Names on the sheet with no player in the pool, in sheet order. */
  readonly notFound: readonly string[];
  /** Names that fit more than one player, left alone rather than guessed. */
  readonly ambiguous: readonly string[];
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
): ImportPlan {
  const nameColumn = roles.findIndex((role) => role?.kind === 'name');
  const teamColumn = roles.findIndex((role) => role?.kind === 'team');
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
  const ambiguous: string[] = [];
  const duplicates: string[] = [];

  dataRows.forEach((row, index) => {
    const name = String(row[nameColumn]).trim();
    const result = matcher.match(name, teamColumn >= 0 ? row[teamColumn] : null);
    if (result.kind === 'not-found') {
      notFound.push(name);
      return;
    }
    if (result.kind === 'ambiguous') {
      ambiguous.push(name);
      return;
    }
    const player = result.player;
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

  return { stats, notFound, ambiguous, duplicates, rowCount: dataRows.length };
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
 * The projection with the sheet's values written over it. Only the stats the sheet gives change;
 * every other stat, and every player it does not name, keeps what it had. Games played and time on
 * ice are written as they are and never rescale the rest, as a hand edit of them would: the sheet's
 * goals were projected over the sheet's games already.
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
    for (const [stat, value] of Object.entries(line) as [StatKey, number][]) {
      if (!holdsStat(projection.type, stat)) {
        continue;
      }
      if ((SKATER_UTILITY_STAT_KEYS as readonly string[]).includes(stat)) {
        utility[stat] = value;
      } else {
        scoring[stat] = value;
      }
    }
    return { ...projection, stats: { scoring, utility } } as Projection;
  });
}
