import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { IconComponent } from '../../shared/icon/icon';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  formatGames,
  formatToi,
  LineColumn,
  lineColumns,
  LineStat,
  lineStats,
  NO_RATE,
} from '../../streamer-planner/planner-free-agents';
import { Swap } from '../drop-candidates';
import { ScoutRow, toiPerGame } from '../scout-ranking';

/** A player with his line in the league's categories, ready to draw. */
interface ScoutEntry {
  readonly row: ScoutRow;
  readonly cells: readonly (LineStat | null)[];
}

/** A minute a game more ice than the preseason line gave him: a role, not a rounding. */
const MORE_ICE_SECONDS = 60;

/**
 * The available skaters, or goalies, best first on the rest of the season, each beside the place
 * the model's preseason line gave him among the same players. The planner's free-agent table with
 * two columns of its own: the rise since the preseason line, and for a skater the ice time, now and
 * then, since more ice is the commonest reason a player is worth more than he was drafted at.
 * Given the user's team, a third: the player to drop for him and what the swap gains.
 */
@Component({
  selector: 'app-scout-table',
  imports: [IconComponent, PositionChipsComponent, TeamLogoComponent, TooltipDirective],
  templateUrl: './scout-table.html',
  styleUrls: [
    '../../streamer-planner/free-agents-table/free-agents-table.css',
    './scout-table.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutTableComponent {
  readonly rows = input.required<readonly ScoutRow[]>();
  readonly scoringType = input.required<ScoringType>();
  /** The categories the league scores, in the league's order. */
  readonly categories = input.required<readonly ScoringStatKey[]>();
  /** Each player's best swap by platform id, or null for no Swap column: no team of the user's. */
  readonly swaps = input<ReadonlyMap<string, Swap | null> | null>(null);

  private readonly lines = computed(() => {
    const categories = this.categories();
    return this.rows().map((row) => ({ row, stats: lineStats(row, categories) }));
  });

  readonly kind = computed(() => this.rows()[0]?.line.type ?? 'skater');

  readonly columns = computed<readonly LineColumn[]>(() =>
    lineColumns(
      this.lines().map((entry) => entry.stats),
      this.categories(),
    ),
  );

  readonly entries = computed<readonly ScoutEntry[]>(() => {
    const columns = this.columns();
    return this.lines().map(({ row, stats }) => {
      const byKey = new Map(stats.map((stat) => [stat.key, stat]));
      return { row, cells: columns.map((column) => byKey.get(column.key) ?? null) };
    });
  });

  readonly rankTip = computed(() =>
    this.kind() === 'skater'
      ? 'His place among every available skater for the rest of the season, whatever the positions shown'
      : 'His place among every available goalie for the rest of the season',
  );

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  score(row: ScoutRow): string {
    return row.score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  perGame(row: ScoutRow): string {
    if (row.games <= 0) {
      return '';
    }
    return `${(row.score / row.games).toFixed(this.scoringType() === 'points' ? 2 : 3)}/gm`;
  }

  games(row: ScoutRow): string {
    return formatGames(row.games);
  }

  /** "+128" for a rise, "-4" for a fall, "0" for neither. */
  rise(row: ScoutRow): string {
    if (row.rise === null) {
      return '';
    }
    return row.rise > 0 ? `+${row.rise}` : `${row.rise}`;
  }

  riseTip(row: ScoutRow): string {
    if (row.preseasonRank === null) {
      return 'The model had no projection for him before the season';
    }
    return `Ranked ${row.preseasonRank} of these players on the preseason projection, ${row.rank} on the rest of the season`;
  }

  toiNow(row: ScoutRow): string {
    return formatToi(toiPerGame(row.line));
  }

  toiThen(row: ScoutRow): string {
    return formatToi(toiPerGame(row.preseason));
  }

  toiUp(row: ScoutRow): boolean {
    const now = toiPerGame(row.line);
    const then = toiPerGame(row.preseason);
    return now !== undefined && then !== undefined && now - then >= MORE_ICE_SECONDS;
  }

  swap(row: ScoutRow): Swap | null {
    return this.swaps()?.get(row.player.playerId) ?? null;
  }

  /** "+12.4" for an upgrade, "-3.1" for none. */
  gain(swap: Swap): string {
    const digits = this.scoringType() === 'points' ? 1 : 2;
    return swap.gain > 0 ? `+${swap.gain.toFixed(digits)}` : swap.gain.toFixed(digits);
  }

  swapTip(row: ScoutRow): string {
    const swap = this.swap(row);
    if (!swap) {
      return 'Every player you could drop for him is needed to fill your lineup';
    }
    return swap.gain > 0
      ? `Drop ${swap.drop.player.name} for him: your lowest-projected player whose spot he can fill`
      : `Not an upgrade: he projects below ${swap.drop.player.name}, the player you would drop for him`;
  }

  onWaivers(row: ScoutRow): boolean {
    return row.player.availability === 'WAIVERS';
  }

  isNil(stat: LineStat): boolean {
    return stat.value === NO_RATE || Number(stat.value) === 0;
  }
}
