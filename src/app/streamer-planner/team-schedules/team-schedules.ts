import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ScheduledGame } from '../../api/models/scheduled-game';
import { IconComponent } from '../../shared/icon/icon';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  formatDay,
  matchupLabel,
  matchupTier,
  parseDate,
  PlannerTeamRow,
  rankTier,
  Tier,
} from '../planner-schedule';

/** A column the table sorts by. */
export type TeamSortKey =
  | 'team'
  | 'score'
  | 'games'
  | 'homeGames'
  | 'awayGames'
  | 'offNightGames'
  | 'backToBacks'
  | 'favourable'
  | 'unfavourable';

export interface TeamColumn {
  readonly key: TeamSortKey;
  readonly label: string;
  readonly tooltip: string;
}

export const TEAM_COLUMNS: readonly TeamColumn[] = [
  { key: 'score', label: 'Score', tooltip: 'Streaming score: higher is a better schedule' },
  { key: 'games', label: 'GP', tooltip: 'Games on the nights counted' },
  { key: 'homeGames', label: 'Home', tooltip: 'Home games' },
  { key: 'awayGames', label: 'Away', tooltip: 'Away games' },
  { key: 'offNightGames', label: 'Off', tooltip: 'Games on an off-night' },
  { key: 'backToBacks', label: 'B2B', tooltip: 'Second games of a back-to-back' },
  { key: 'favourable', label: 'Fav', tooltip: 'Games against a favourable opponent' },
  { key: 'unfavourable', label: 'Unfav', tooltip: 'Games against an unfavourable opponent' },
];

/**
 * Every team's schedule over the nights counted, best first, one row a team. A row opens to the
 * games behind its numbers, tinted by how many goals the opponent concedes.
 */
@Component({
  selector: 'app-team-schedules',
  imports: [IconComponent, TeamLogoComponent, TooltipDirective],
  templateUrl: './team-schedules.html',
  styleUrl: './team-schedules.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSchedulesComponent {
  readonly rows = input.required<readonly PlannerTeamRow[]>();

  readonly columns = TEAM_COLUMNS;
  readonly sortKey = signal<TeamSortKey>('score');
  readonly descending = signal(true);
  /** The team whose games are open, if any. */
  readonly expanded = signal<string | null>(null);

  readonly sorted = computed<readonly PlannerTeamRow[]>(() => {
    const key = this.sortKey();
    const direction = this.descending() ? -1 : 1;
    return [...this.rows()].sort((a, b) => {
      const order = key === 'team' ? a.team.localeCompare(b.team) : compareNumbers(a[key], b[key]);
      // Level on the column, the better-ranked team first, then the alphabet.
      return order * direction || a.rank - b.rank || a.team.localeCompare(b.team);
    });
  });

  /** Sorts by a column, best first; the same column again turns the order round. */
  sort(key: TeamSortKey): void {
    if (this.sortKey() === key) {
      this.descending.update((descending) => !descending);
      return;
    }
    this.sortKey.set(key);
    this.descending.set(key !== 'team');
  }

  ariaSort(key: TeamSortKey): 'ascending' | 'descending' | null {
    if (this.sortKey() !== key) {
      return null;
    }
    return this.descending() ? 'descending' : 'ascending';
  }

  toggle(team: string): void {
    this.expanded.update((open) => (open === team ? null : team));
  }

  tier(row: PlannerTeamRow): Tier {
    return rankTier(row.rank, this.rows().length);
  }

  matchupTier(game: ScheduledGame): Tier {
    return matchupTier(game);
  }

  matchupLabel(game: ScheduledGame): string {
    return matchupLabel(game);
  }

  /** "Mon, Oct 12". */
  gameDay(game: ScheduledGame): string {
    const weekday = parseDate(game.date).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    });
    return `${weekday}, ${formatDay(game.date)}`;
  }
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}
