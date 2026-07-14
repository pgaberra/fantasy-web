import { Component, computed, input, signal } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  LeagueProjectionColumn,
  LeagueProjectionContributor,
  LeagueProjectionData,
  LeagueProjectionRosterRow,
  LeagueProjectionTeamRow,
} from '../league-projection';

type BreakdownMode = 'category' | 'position';

/** How many of a team's players an expanded category row shows before the "show all" toggle. */
const TOP_ROSTER_ROWS = 5;

/**
 * Diverging heat scale for the stat and total cells: the column leader trends green, the laggard
 * red, and the mid-pack stays clear — so a glance down any column shows who's strongest there.
 * Every value is already "higher is better" (weighted-points / z-score contributions, direction
 * included), so one direction works for every column. The RGB triples mirror --color-success /
 * --color-error in styles.css; they're inlined because the per-cell alpha is computed, not static.
 */
const HEAT_LEADER_RGB = '22, 163, 74';
const HEAT_LAGGARD_RGB = '233, 69, 96';
const HEAT_LEADER_MAX_ALPHA = 0.22;
const HEAT_LAGGARD_MAX_ALPHA = 0.2;

@Component({
  selector: 'app-league-projection-table',
  imports: [TooltipDirective],
  templateUrl: './league-projection-table.html',
  styleUrl: './league-projection-table.css',
})
export class LeagueProjectionTableComponent {
  readonly data = input.required<LeagueProjectionData>();
  readonly scoringType = input.required<ScoringType>();
  readonly scoreHeading = input.required<string>();

  readonly mode = signal<BreakdownMode>('category');
  readonly sortKey = signal<string>('total');
  readonly sortDir = signal<'asc' | 'desc'>('desc');
  readonly expandedTeamId = signal<string | null>(null);
  readonly showAllPlayers = signal<boolean>(false);

  readonly columns = computed(() =>
    this.mode() === 'category' ? this.data().categoryColumns : this.data().positionColumns,
  );

  private readonly ranges = computed(() => {
    const teams = this.data().teams;
    const ranges = new Map<string, { min: number; max: number }>();
    for (const key of [...this.columns().map((column) => column.key), 'total']) {
      const values = teams.map((team) => (key === 'total' ? team.total : team.values[key]));
      if (values.length > 0) {
        ranges.set(key, { min: Math.min(...values), max: Math.max(...values) });
      }
    }
    return ranges;
  });

  readonly sortedTeams = computed(() => {
    const key = this.sortKey();
    const descending = this.sortDir() === 'desc';
    const valueOf = (team: LeagueProjectionTeamRow) =>
      key === 'total' ? team.total : team.values[key];
    return [...this.data().teams].sort((first, second) =>
      descending ? valueOf(second) - valueOf(first) : valueOf(first) - valueOf(second),
    );
  });

  private readonly expandedTeam = computed(
    () => this.data().teams.find((row) => row.teamId === this.expandedTeamId()) ?? null,
  );

  /**
   * The category breakdown expands a team into one row per player; the position breakdown keeps
   * its per-cell lists, because there each player belongs to exactly one slot column and so
   * already appears only once.
   */
  readonly showsRosterRows = computed(
    () => this.mode() === 'category' && this.expandedTeam() !== null,
  );

  readonly expandedRosterSize = computed(() => this.expandedTeam()?.roster.length ?? 0);

  readonly hasHiddenPlayers = computed(
    () => this.mode() === 'category' && this.expandedRosterSize() > TOP_ROSTER_ROWS,
  );

  isExpanded(teamId: string): boolean {
    return this.expandedTeamId() === teamId;
  }

  /** The player rows shown under an expanded team, capped until "show all" is toggled. */
  rosterRows(team: LeagueProjectionTeamRow): LeagueProjectionRosterRow[] {
    return this.showAllPlayers() ? team.roster : team.roster.slice(0, TOP_ROSTER_ROWS);
  }

  /** Players listed inside a position cell when its row is expanded. */
  cellPlayers(
    team: LeagueProjectionTeamRow,
    column: LeagueProjectionColumn,
  ): LeagueProjectionContributor[] {
    return team.positionPlayers[column.key] ?? [];
  }

  toggleExpand(teamId: string): void {
    this.expandedTeamId.update((current) => (current === teamId ? null : teamId));
    this.showAllPlayers.set(false);
  }

  toggleShowAll(): void {
    this.showAllPlayers.update((current) => !current);
  }

  setMode(mode: BreakdownMode): void {
    this.mode.set(mode);
    this.showAllPlayers.set(false);
    if (
      this.sortKey() !== 'total' &&
      !this.columns().some((column) => column.key === this.sortKey())
    ) {
      this.sortKey.set('total');
      this.sortDir.set('desc');
    }
  }

  sortBy(key: string): void {
    if (this.sortKey() === key) {
      this.sortDir.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set('desc');
    }
  }

  sortIndicator(key: string): string {
    if (this.sortKey() !== key) {
      return '';
    }
    return this.sortDir() === 'desc' ? '▼' : '▲';
  }

  shade(key: string, value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'transparent';
    }
    const range = this.ranges().get(key);
    if (!range || range.max === range.min) {
      return 'transparent';
    }
    const intensity = (value - range.min) / (range.max - range.min);
    if (intensity >= 0.5) {
      const alpha = (intensity - 0.5) * 2 * HEAT_LEADER_MAX_ALPHA;
      return `rgba(${HEAT_LEADER_RGB}, ${alpha.toFixed(3)})`;
    }
    const alpha = (0.5 - intensity) * 2 * HEAT_LAGGARD_MAX_ALPHA;
    return `rgba(${HEAT_LAGGARD_RGB}, ${alpha.toFixed(3)})`;
  }

  /** The points-per-unit multiplier under a points-league column header (3, 0.5, -1, …). */
  formatWeight(weight: number): string {
    return parseFloat(weight.toFixed(2)).toString();
  }

  format(value: number | null | undefined, decimals: number): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  }

  formatTotal(value: number): string {
    return this.scoringType() === 'points' ? value.toFixed(1) : value.toFixed(2);
  }
}
