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
  lineColumns,
  lineStats,
  LineColumn,
  LineStat,
  RankedFreeAgent,
} from '../planner-free-agents';

type PlayerKind = RankedFreeAgent['line']['type'];

/** A player with his line in the league's categories, ready to draw. */
export interface FreeAgentRow {
  readonly row: RankedFreeAgent;
  /** His line under the table's columns, a cell a column, null where the model gave him no number. */
  readonly cells: readonly (LineStat | null)[];
}

/**
 * The best available skaters, or the best available goalies, as one list, best first, with the
 * model's line for the nights counted, in every category the league scores for that kind of
 * player, and scored by the league's own settings. The list is one kind or the other, never both:
 * the two score different categories, and a column has to mean the same thing on every row.
 * Which kind, which positions and how many rows is the page's to say.
 */
@Component({
  selector: 'app-free-agents-table',
  imports: [IconComponent, PositionChipsComponent, TeamLogoComponent, TooltipDirective],
  templateUrl: './free-agents-table.html',
  styleUrl: './free-agents-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeAgentsTableComponent {
  readonly rows = input.required<readonly RankedFreeAgent[]>();
  readonly scoringType = input.required<ScoringType>();
  /** The categories the league scores, in the league's order. */
  readonly categories = input.required<readonly ScoringStatKey[]>();
  /** The categories the list is ranked by, if narrowed to some: those columns are the ones read. */
  readonly focus = input<ReadonlySet<ScoringStatKey>>(new Set());
  /** "PPP, SOG": the same categories, as the score's tip names them. */
  readonly focusLabel = input('');

  private readonly lines = computed(() => {
    const categories = this.categories();
    return this.rows().map((row) => ({ row, stats: lineStats(row, categories) }));
  });

  /** Whose list this is, and so whose categories head the columns: the page hands it one kind. */
  readonly kind = computed<PlayerKind>(() => this.rows()[0]?.line.type ?? 'skater');

  /** A column a category, named once in the heading instead of beside every number. */
  readonly columns = computed<readonly LineColumn[]>(() =>
    lineColumns(
      this.lines().map((entry) => entry.stats),
      this.categories(),
    ),
  );

  readonly entries = computed<readonly FreeAgentRow[]>(() => {
    const columns = this.columns();
    return this.lines().map(({ row, stats }) => {
      const byKey = new Map(stats.map((stat) => [stat.key, stat]));
      return { row, cells: columns.map((column) => byKey.get(column.key) ?? null) };
    });
  });

  readonly rankTip = computed(() =>
    this.kind() === 'skater'
      ? 'His place among every available skater, whatever the positions shown'
      : 'His place among every available goalie',
  );

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  readonly scoreTip = computed(() => {
    const label = this.focusLabel();
    return label
      ? `The model's line for the nights counted, scored in ${label} alone`
      : "The model's line for the nights counted, scored by your league's settings";
  });

  /** Picked, while the list is ranked by some categories; null while it is ranked by all. */
  focused(key: ScoringStatKey): boolean | null {
    const focus = this.focus();
    return focus.size === 0 ? null : focus.has(key);
  }

  score(row: RankedFreeAgent): string {
    return row.score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  /** The score per game he plays, the way a streamer compares a three-game week to a four. */
  perGame(row: RankedFreeAgent): string {
    if (row.games <= 0) {
      return '';
    }
    return `${(row.score / row.games).toFixed(this.scoringType() === 'points' ? 1 : 2)}/gm`;
  }

  games(row: RankedFreeAgent): string {
    return formatGames(row.games);
  }

  /** Ice time a game, for a skater; a goalie's is the whole game or none of it. */
  toi(row: RankedFreeAgent): string {
    if (row.player.projection.type !== 'skater') {
      return '';
    }
    return formatToi(row.player.projection.stats.utility.toiPerGame);
  }

  /** A claim rather than an add: the one status a streamer has to know before acting. */
  onWaivers(row: RankedFreeAgent): boolean {
    return row.player.availability === 'WAIVERS';
  }

  /** Nothing projected in the category: there, but not what he is picked up for. */
  isNil(stat: LineStat): boolean {
    return Number(stat.value) === 0;
  }
}
