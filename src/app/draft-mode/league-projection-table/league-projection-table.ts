import { Component, computed, input, signal } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { LeagueProjectionColumn, LeagueProjectionData } from '../league-projection';

type BreakdownMode = 'category' | 'position';

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
  readonly selectedTeamId = signal<string | null>(null);

  readonly columns = computed(() =>
    this.mode() === 'category' ? this.data().categoryColumns : this.data().positionColumns,
  );

  private readonly ranges = computed(() => {
    const teams = this.data().teams;
    const ranges = new Map<string, { min: number; max: number }>();
    for (const column of this.columns()) {
      const values = teams.map((team) => team.values[column.key]).filter((value) => value !== null);
      if (values.length > 0) {
        ranges.set(column.key, { min: Math.min(...values), max: Math.max(...values) });
      }
    }
    return ranges;
  });

  readonly sortedTeams = computed(() => {
    const key = this.sortKey();
    const descending = this.sortDir() === 'desc';
    const valueOf = (team: LeagueProjectionData['teams'][number]) =>
      key === 'total' ? team.total : team.values[key];
    return [...this.data().teams].sort((first, second) => {
      const firstValue = valueOf(first);
      const secondValue = valueOf(second);
      if (firstValue === null && secondValue === null) {
        return 0;
      }
      if (firstValue === null) {
        return 1;
      }
      if (secondValue === null) {
        return -1;
      }
      return descending ? secondValue - firstValue : firstValue - secondValue;
    });
  });

  readonly selectedTeam = computed(
    () => this.data().teams.find((team) => team.teamId === this.selectedTeamId()) ?? null,
  );

  readonly breakdownGroups = computed(() => {
    const team = this.selectedTeam();
    if (!team) {
      return [];
    }
    return this.data()
      .positionColumns.map((column) => ({
        label: column.label,
        sum: team.values[column.key],
        players: team.positionBreakdown[column.key] ?? [],
      }))
      .filter((group) => group.players.length > 0);
  });

  selectTeam(teamId: string): void {
    this.selectedTeamId.update((current) => (current === teamId ? null : teamId));
  }

  setMode(mode: BreakdownMode): void {
    this.mode.set(mode);
    if (
      this.sortKey() !== 'total' &&
      !this.columns().some((column) => column.key === this.sortKey())
    ) {
      this.sortKey.set('total');
      this.sortDir.set('desc');
    }
  }

  sortBy(key: string, lowerIsBetter = false): void {
    if (this.sortKey() === key) {
      this.sortDir.update((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(lowerIsBetter ? 'asc' : 'desc');
    }
  }

  sortIndicator(key: string): string {
    if (this.sortKey() !== key) {
      return '';
    }
    return this.sortDir() === 'desc' ? '▼' : '▲';
  }

  shade(column: LeagueProjectionColumn, value: number | null): string {
    if (value === null) {
      return 'transparent';
    }
    const range = this.ranges().get(column.key);
    if (!range || range.max === range.min) {
      return 'transparent';
    }
    let intensity = (value - range.min) / (range.max - range.min);
    if (column.lowerIsBetter) {
      intensity = 1 - intensity;
    }
    return `rgba(30, 107, 255, ${(intensity * 0.16).toFixed(3)})`;
  }

  format(value: number | null, decimals: number): string {
    if (value === null) {
      return '—';
    }
    return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  }

  formatTotal(value: number): string {
    return this.scoringType() === 'points' ? value.toFixed(1) : value.toFixed(2);
  }
}
