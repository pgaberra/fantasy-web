import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../../models/stat-key.model';
import { IconComponent } from '../../shared/icon/icon';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  formatGames,
  formatToi,
  FreeAgentSort,
  FreeAgentSortKey,
  lineColumns,
  lineStats,
  LineColumn,
  LineStat,
  NO_RATE,
  RANKED_ORDER,
  RankedFreeAgent,
} from '../planner-free-agents';

const SKATER_KEYS: ReadonlySet<string> = new Set(SKATER_SCORING_STAT_KEYS);
const GOALIE_KEYS: ReadonlySet<string> = new Set(GOALIE_SCORING_STAT_KEYS);

/**
 * What a cell under the other kind's category holds: a goalie's goals do not exist, so the cell
 * says so as the editor and the other tables do, rather than sit blank like a number the model
 * left out.
 */
export const NOT_HIS = '—';

/** A player with his line in the league's categories, ready to draw. */
export interface FreeAgentRow {
  readonly row: RankedFreeAgent;
  /** His line under the table's columns, a cell a column, null where the model gave him no number. */
  readonly cells: readonly (LineStat | null)[];
  /** Per column, whether the category is the other kind's: a skater's under a goalie's, and back. */
  readonly notHis: readonly boolean[];
}

/**
 * The best available players, skaters and goalies together, best first, with the model's line for
 * the nights counted in every category the league scores, and scored by the league's own settings.
 * The skaters' categories come first and the goalies' after, set off by a rule: a column means one
 * category on every row, a faint dash on a player of the kind that does not score in it. The first few
 * rows can be set off as the best picks, in the table's own columns rather than as cards over it.
 * Which positions, how many rows and how many of them are set off is the page's to say, and so is
 * the order: a heading asks for it, and the page sorts the whole list before cutting it into pages.
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
  /**
   * The whole list the rows are a page of, which the columns are drawn for: sorted by assists or
   * paged on, the goalies' columns stay while no goalie is on the page. The rows alone if not given.
   */
  readonly listed = input<readonly RankedFreeAgent[]>();
  readonly scoringType = input.required<ScoringType>();
  /** The categories the league scores, in the league's order. */
  readonly categories = input.required<readonly ScoringStatKey[]>();
  /** The categories the list is ranked by, if narrowed to some: those columns are the ones read. */
  readonly focus = input<ReadonlySet<ScoringStatKey>>(new Set());
  /** "PPP, SOG": the same categories, as the score's tip names them. */
  readonly focusLabel = input('');
  /** How many rows at the head of the list are set off as the best picks; none unless the page says. */
  readonly top = input(0);
  /** The order the list is in, which the headings show. */
  readonly sort = input<FreeAgentSort>(RANKED_ORDER);
  /** A heading pressed: the page sorts by that column, or turns it round. */
  readonly sortBy = output<FreeAgentSortKey>();

  private readonly lines = computed(() => {
    const categories = this.categories();
    return this.rows().map((row) => ({ row, stats: lineStats(row, categories) }));
  });

  private readonly list = computed(() => this.listed() ?? this.rows());

  /** Ice time a game is a skater's number: no column of blanks over a list of goalies alone. */
  readonly hasSkaters = computed(() => this.list().some((row) => row.line.type === 'skater'));

  /** A column a category, named once in the heading instead of beside every number. */
  readonly columns = computed<readonly LineColumn[]>(() => {
    const categories = this.categories();
    return lineColumns(
      this.list().map((row) => lineStats(row, categories)),
      categories,
    );
  });

  /**
   * The columns a rule is drawn before: the first category, setting the line off from the columns
   * about the player, and the first goalie category after a skater one, setting the two kinds apart.
   */
  readonly groupStarts = computed<readonly boolean[]>(() => {
    const goalieOnly = this.columns().map((column) => !SKATER_KEYS.has(column.key));
    return goalieOnly.map((goalie, index) => index === 0 || (goalie && !goalieOnly[index - 1]));
  });

  readonly entries = computed<readonly FreeAgentRow[]>(() => {
    const columns = this.columns();
    return this.lines().map(({ row, stats }) => {
      const byKey = new Map(stats.map((stat) => [stat.key, stat]));
      const own = row.line.type === 'skater' ? SKATER_KEYS : GOALIE_KEYS;
      return {
        row,
        cells: columns.map((column) => byKey.get(column.key) ?? null),
        notHis: columns.map((column) => !own.has(column.key)),
      };
    });
  });

  readonly notHis = NOT_HIS;

  readonly rankTip = 'His place among every available player, whatever the positions shown';

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  readonly scoreTip = computed(() => {
    const label = this.focusLabel();
    return label
      ? `The model's line for the nights counted, scored in ${label} alone`
      : "The model's line for the nights counted, scored by your league's settings";
  });

  readonly perGameTip = computed(() =>
    this.scoringType() === 'points'
      ? 'Projected points per game he plays'
      : 'Z-Score per game he plays',
  );

  ariaSort(key: FreeAgentSortKey): 'ascending' | 'descending' | null {
    const sort = this.sort();
    if (sort.key !== key) {
      return null;
    }
    return sort.descending ? 'descending' : 'ascending';
  }

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
    return (row.score / row.games).toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  games(row: RankedFreeAgent): string {
    return formatGames(row.games);
  }

  /** Ice time a game, for a skater; a goalie's is the whole game or none of it. */
  toi(row: RankedFreeAgent): string {
    if (row.player.projection.type !== 'skater') {
      return NOT_HIS;
    }
    return formatToi(row.player.projection.stats.utility.toiPerGame);
  }

  /** A claim rather than an add: the one status a streamer has to know before acting. */
  onWaivers(row: RankedFreeAgent): boolean {
    return row.player.availability === 'WAIVERS';
  }

  /** Nothing projected in the category: there, but not what he is picked up for. */
  isNil(stat: LineStat): boolean {
    return stat.value === NO_RATE || Number(stat.value) === 0;
  }
}
