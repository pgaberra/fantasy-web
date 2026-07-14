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

  /** Teams are expanded independently — any number of them can be open at once. */
  readonly expandedTeamIds = signal<ReadonlySet<string>>(new Set());
  /** Which of those teams have their full roster revealed. Tracked per team, so "show all" on one
      team doesn't spill into another's list. */
  readonly showAllTeamIds = signal<ReadonlySet<string>>(new Set());

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

  /**
   * The category breakdown expands a team into one row per player; the position breakdown keeps
   * its per-cell lists, because there each player belongs to exactly one slot column and so
   * already appears only once.
   */
  readonly showsRosterRows = computed(() => this.mode() === 'category');

  isExpanded(teamId: string): boolean {
    return this.expandedTeamIds().has(teamId);
  }

  isShowingAll(teamId: string): boolean {
    return this.showAllTeamIds().has(teamId);
  }

  /** Whether this team has more players than an expanded row shows before the "show all" toggle. */
  hasHiddenPlayers(team: LeagueProjectionTeamRow): boolean {
    return this.showsRosterRows() && team.roster.length > TOP_ROSTER_ROWS;
  }

  /**
   * The player rows shown under an expanded team, ordered by whichever column the table is sorted
   * on — sort by Goals and each team's players lead with its top scorer — and capped until the
   * team's own "show all" is toggled.
   */
  rosterRows(team: LeagueProjectionTeamRow): LeagueProjectionRosterRow[] {
    const sorted = this.sortRoster(team.roster);
    return this.isShowingAll(team.teamId) ? sorted : sorted.slice(0, TOP_ROSTER_ROWS);
  }

  private sortRoster(roster: readonly LeagueProjectionRosterRow[]): LeagueProjectionRosterRow[] {
    const key = this.sortKey();
    const descending = this.sortDir() === 'desc';
    // Rank on the same basis the team rows sort on: overall value for the total column, and the
    // direction-adjusted contribution for a category column (so lower-is-better stats still order
    // best-first, matching the team ordering).
    const rankOf = (row: LeagueProjectionRosterRow) =>
      key === 'total' ? row.total : row.contributions[key];
    return [...roster].sort((first, second) => {
      const firstRank = rankOf(first);
      const secondRank = rankOf(second);
      // Players the sorted stat doesn't apply to (a goalie has no goals) sink to the bottom either way.
      if (firstRank === null && secondRank === null) {
        return 0;
      }
      if (firstRank === null) {
        return 1;
      }
      if (secondRank === null) {
        return -1;
      }
      return descending ? secondRank - firstRank : firstRank - secondRank;
    });
  }

  /** Players listed inside a position cell when its row is expanded. */
  cellPlayers(
    team: LeagueProjectionTeamRow,
    column: LeagueProjectionColumn,
  ): LeagueProjectionContributor[] {
    return team.positionPlayers[column.key] ?? [];
  }

  toggleExpand(teamId: string): void {
    const expanded = new Set(this.expandedTeamIds());
    if (!expanded.delete(teamId)) {
      expanded.add(teamId);
    }
    this.expandedTeamIds.set(expanded);
    // A collapsed team forgets it was showing its full roster, so re-expanding starts capped again.
    this.setShowingAll(teamId, false);
  }

  toggleShowAll(teamId: string): void {
    this.setShowingAll(teamId, !this.isShowingAll(teamId));
  }

  private setShowingAll(teamId: string, showAll: boolean): void {
    const showingAll = new Set(this.showAllTeamIds());
    if (showAll) {
      showingAll.add(teamId);
    } else {
      showingAll.delete(teamId);
    }
    this.showAllTeamIds.set(showingAll);
  }

  setMode(mode: BreakdownMode): void {
    this.mode.set(mode);
    this.showAllTeamIds.set(new Set());
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
