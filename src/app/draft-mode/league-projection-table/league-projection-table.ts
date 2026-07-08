import { Component, computed, input, signal } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  LeagueProjectionColumn,
  LeagueProjectionContributor,
  LeagueProjectionData,
  LeagueProjectionTeamRow,
} from '../league-projection';

type BreakdownMode = 'category' | 'position';

const TOP_CONTRIBUTORS = 3;

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
    for (const column of this.columns()) {
      const values = teams.map((team) => team.values[column.key]);
      if (values.length > 0) {
        ranges.set(column.key, { min: Math.min(...values), max: Math.max(...values) });
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

  /** Whether the expanded row has category cells with more contributors than the collapsed cap. */
  readonly hasHiddenContributors = computed(() => {
    if (this.mode() !== 'category') {
      return false;
    }
    const team = this.data().teams.find((row) => row.teamId === this.expandedTeamId());
    if (!team) {
      return false;
    }
    return this.columns().some(
      (column) => (team.categoryContributors[column.key]?.length ?? 0) > TOP_CONTRIBUTORS,
    );
  });

  isExpanded(teamId: string): boolean {
    return this.expandedTeamId() === teamId;
  }

  /** Players to list inside a cell when its row is expanded. */
  cellPlayers(
    team: LeagueProjectionTeamRow,
    column: LeagueProjectionColumn,
  ): LeagueProjectionContributor[] {
    if (this.mode() === 'position') {
      return team.positionPlayers[column.key] ?? [];
    }
    const contributors = team.categoryContributors[column.key] ?? [];
    return this.showAllPlayers() ? contributors : contributors.slice(0, TOP_CONTRIBUTORS);
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

  shade(column: LeagueProjectionColumn, value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'transparent';
    }
    const range = this.ranges().get(column.key);
    if (!range || range.max === range.min) {
      return 'transparent';
    }
    const intensity = (value - range.min) / (range.max - range.min);
    return `rgba(30, 107, 255, ${(intensity * 0.16).toFixed(3)})`;
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
