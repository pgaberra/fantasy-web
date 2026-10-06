import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { nhlTeamKey } from '../../models/nhl-team';
import { ScoringType } from '../../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../../models/stat-key.model';
import { IconComponent } from '../../shared/icon/icon';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { ScrolledSidewaysDirective } from '../../shared/scrolled-sideways/scrolled-sideways.directive';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  formatGames,
  formatToi,
  FreeAgentSort,
  FreeAgentSortKey,
  lineColumns,
  lineStats,
  liftStats,
  LineColumn,
  LineStat,
  NO_RATE,
  RANKED_ORDER,
  RankedFreeAgent,
} from '../planner-free-agents';

const SKATER_KEYS: ReadonlySet<string> = new Set(SKATER_SCORING_STAT_KEYS);

/** The medals for the first places, best first. */
const MEDALS = ['gold', 'silver', 'bronze'] as const;
export type Medal = (typeof MEDALS)[number];
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
  /** His line with the games a drop would add, under the same columns; null where a drop adds none. */
  readonly liftedCells: readonly (LineStat | null)[] | null;
}

/**
 * The best available players, skaters and goalies together, best first, with the model's line for
 * the nights counted in every category the league scores, and scored by the league's own settings.
 * The skaters' categories come first and the goalies' after, set off by a rule: a column means one
 * category on every row, a faint dash on a player of the kind that does not score in it. The best few
 * of everyone available can be set off as the best picks, in the table's own columns rather than as
 * cards over it.
 * Which positions, how many rows and how many of them are set off is the page's to say, and so is
 * the order: a heading asks for it, and the page sorts the whole list before cutting it into pages.
 */
@Component({
  selector: 'app-free-agents-table',
  imports: [
    IconComponent,
    PositionChipsComponent,
    ScrolledSidewaysDirective,
    TeamLogoComponent,
    TooltipDirective,
  ],
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
  /**
   * How many places are set off as the best picks; none unless the page says. A place is the rank
   * the row shows, among every available player, so a list narrowed to some positions sets off only
   * the ones the whole list would: its own head may be fourth and sixth, and wear nothing.
   */
  readonly top = input(0);
  /** The order the list is in, which the headings show. */
  readonly sort = input<FreeAgentSort>(RANKED_ORDER);
  /** A heading pressed: the page sorts by that column, or turns it round. */
  readonly sortBy = output<FreeAgentSortKey>();

  private readonly lines = computed(() => {
    const categories = this.categories();
    return this.rows().map((row) => ({
      row,
      stats: lineStats(row, categories),
      lifted: row.lifted ? lineStats({ ...row, line: row.lifted.line }, categories) : null,
    }));
  });

  /**
   * The players whose row is turned to the line a drop would give them. A press on the yellow
   * games turns it, and another turns it back: the two lines are never read side by side, and the
   * ranking stays the list's own, since what the drop nets is the dropped player's loss too.
   */
  private readonly liftedIds = signal<ReadonlySet<string>>(new Set());

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
    return this.lines().map(({ row, stats, lifted }) => {
      const byKey = new Map(stats.map((stat) => [stat.key, stat]));
      const liftedByKey = lifted ? new Map(lifted.map((stat) => [stat.key, stat])) : null;
      const own = row.line.type === 'skater' ? SKATER_KEYS : GOALIE_KEYS;
      return {
        row,
        cells: columns.map((column) => byKey.get(column.key) ?? null),
        notHis: columns.map((column) => !own.has(column.key)),
        liftedCells: liftedByKey
          ? columns.map((column) => liftedByKey.get(column.key) ?? null)
          : null,
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

  /** The medal his place wins, if it is one of the places set off. */
  medalOf(row: RankedFreeAgent): Medal | null {
    return row.rank <= this.top() ? (MEDALS[row.rank - 1] ?? null) : null;
  }

  /** Turned to the line a drop would give him. */
  isLifted(row: RankedFreeAgent): boolean {
    return row.lifted !== undefined && this.liftedIds().has(row.player.playerId);
  }

  toggleLift(row: RankedFreeAgent): void {
    if (!row.lifted) {
      return;
    }
    this.liftedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(row.player.playerId)) {
        next.add(row.player.playerId);
      }
      return next;
    });
  }

  /** The cells the row reads: his own line, or the lifted one while it is turned to that. */
  cells(entry: FreeAgentRow): readonly (LineStat | null)[] {
    return this.isLifted(entry.row) && entry.liftedCells ? entry.liftedCells : entry.cells;
  }

  score(row: RankedFreeAgent): string {
    return this.scoreOf(row).toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  /** The score per game he plays, the way a streamer compares a three-game week to a four. */
  perGame(row: RankedFreeAgent): string {
    const games = this.gamesOf(row);
    if (games <= 0) {
      return '';
    }
    return (this.scoreOf(row) / games).toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  games(row: RankedFreeAgent): string {
    return formatGames(this.gamesOf(row));
  }

  /** His score, or the lifted line's while the row is turned to it. */
  private scoreOf(row: RankedFreeAgent): number {
    return this.isLifted(row) ? row.lifted!.score : row.score;
  }

  /** His games, and the drop's with them while the row is turned to the lifted line. */
  private gamesOf(row: RankedFreeAgent): number {
    return this.isLifted(row) ? row.games + (row.dropGames ?? 0) : row.games;
  }

  /** "+2", the games a drop would add beside his own, in yellow as on the game days; null for none. */
  dropGames(row: RankedFreeAgent): string | null {
    const more = Math.round(row.dropGames ?? 0);
    return more > 0 ? `+${more}` : null;
  }

  /**
   * What the yellow games are, what they would add to his line, and that a press shows it. The
   * score leaves them out: he would play each in place of the player dropped.
   */
  dropGamesTip(row: RankedFreeAgent): string {
    const more = Math.round(row.dropGames ?? 0);
    const games = `${more} more ${more === 1 ? 'game' : 'games'} if you drop a player who plays those nights`;
    const lift = this.lift(row);
    const adds = lift.length > 0 ? `, worth ${lift.join(', ')}` : '';
    return `${games}${adds}. Not in his score: he would play in place of the player dropped. Press to see his line with them.`;
  }

  /** "+0.4 G", "+7.8 pts": what the drop's games add, the score last, for the tip. */
  private lift(row: RankedFreeAgent): string[] {
    if (!row.lifted) {
      return [];
    }
    const stats = liftStats(row, this.categories()).map((stat) => `${stat.value} ${stat.label}`);
    const more = row.lifted.score - row.score;
    const points = this.scoringType() === 'points';
    const decimals = points ? 1 : 2;
    if (Math.abs(more) >= 0.5 / 10 ** decimals) {
      stats.push(`${more > 0 ? '+' : ''}${more.toFixed(decimals)} ${points ? 'pts' : 'Z'}`);
    }
    return stats;
  }

  /** Ice time a game, for a skater; a goalie's is the whole game or none of it. */
  toi(row: RankedFreeAgent): string {
    if (row.player.projection.type !== 'skater') {
      return NOT_HIS;
    }
    return formatToi(row.player.projection.stats.utility.toiPerGame);
  }

  /** His club in the NHL's letters, as the crest's badge spells it; null for no club. */
  club(row: RankedFreeAgent): string | null {
    return nhlTeamKey(row.player.teamAbbrev);
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
