import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DEFAULT_DECIMAL_SETTINGS } from '../../draft-projection/projection-settings-section/model';
import { ScoringType } from '../../models/projection.model';
import {
  LOWER_IS_BETTER_SCORING_STAT_KEYS,
  RATE_STAT_KEYS,
  ScoringStatKey,
} from '../../models/stat-key.model';
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
import { LineupSwap } from '../lineup-value';
import {
  SCOUT_RANKED_ORDER,
  ScoutRow,
  ScoutSort,
  ScoutSortKey,
  statOf,
  toiPerGame,
} from '../scout-ranking';
import {
  formatIce,
  formatIceChange,
  formatShare,
  formatShareChange,
  lineLabel,
  MIN_ICE_CHANGE_SECONDS,
  MIN_POWER_PLAY_SHARE_CHANGE,
  powerPlayLabel,
} from '../scout-usage';

/** A change since the chosen day, as a cell writes it under the figure: "+2.4", and which way. */
export interface Delta {
  readonly text: string;
  readonly dir: 'up' | 'down' | 'flat';
}

/** A player's line in the league's categories, each with its change, ready to draw. */
interface ScoutEntry {
  readonly row: ScoutRow;
  readonly cells: readonly { readonly stat: LineStat | null; readonly delta: Delta | null }[];
}

/** A minute a game more ice than the chosen day's line gave him: a role, not a rounding. */
const MORE_ICE_SECONDS = 60;

/**
 * Every player on the page in one list, skaters and goalies, each as the model sees him today
 * beside how it saw him on the chosen day and what the ice has said since. The planner's
 * free-agent table, with every figure wearing its change underneath: the score and the places
 * gained, the games, the ice time, each category the league scores; then the measured ice a
 * game and share of the power play since the day, and where the lineup page lists him; and,
 * given the user's team, the player to drop for him and what the lineup gains. The order is the
 * page's to say: a heading asks for it, and the page sorts the whole list before cutting it into
 * pages.
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
  /** What the then-lines are, for the group heading: "vs 7 Oct", "vs preseason". */
  readonly sinceLabel = input<string>('vs preseason');
  /** What the ice is measured since, for its group heading: "since 7 Oct", "this season". */
  readonly iceLabel = input<string>('since the day');
  /** Whether each row says who holds the player: only a list of more than the wire needs it. */
  readonly showOwner = input<boolean>(false);
  /** Each player's best swap by platform id, or null for no Swap column: no team of the user's. */
  readonly swaps = input<ReadonlyMap<string, LineupSwap | null> | null>(null);
  /** The order the list is in, which the headings show. */
  readonly sort = input<ScoutSort>(SCOUT_RANKED_ORDER);
  /** A heading pressed: the page sorts the whole list by that column, or turns it round. */
  readonly sortBy = output<ScoutSortKey>();

  private readonly lines = computed(() => {
    const categories = this.categories();
    return this.rows().map((row) => ({ row, stats: lineStats(row, categories) }));
  });

  /** Whether any skater is listed: only a skater has ice time and a role on the ice to show. */
  readonly anySkater = computed(() => this.rows().some((row) => row.line.type === 'skater'));

  /** Whether any row has measured ice to show. */
  readonly anyUsage = computed(() => this.rows().some((row) => row.usage !== null));

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
      return {
        row,
        cells: columns.map((column) => {
          const stat = byKey.get(column.key) ?? null;
          return { stat, delta: stat ? this.deltaStat(row, column.key) : null };
        }),
      };
    });
  });

  /** How many columns the projection group spans: score, rank, games, ice time and the categories. */
  readonly projectionSpan = computed(() => 3 + (this.anySkater() ? 1 : 0) + this.columns().length);

  readonly rankTip =
    'His place among every player in the league the model projects, whoever holds him';

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  ariaSort(key: ScoutSortKey): 'ascending' | 'descending' | null {
    const sort = this.sort();
    if (sort.key !== key) {
      return null;
    }
    return sort.descending ? 'descending' : 'ascending';
  }

  private scoreDigits(): number {
    return this.scoringType() === 'points' ? 1 : 2;
  }

  score(row: ScoutRow): string {
    return row.score.toFixed(this.scoreDigits());
  }

  /** The change in score since the day; null without a then-line. */
  deltaScore(row: ScoutRow): Delta | null {
    return row.delta === null ? null : signed(row.delta, this.scoreDigits());
  }

  games(row: ScoutRow): string {
    return formatGames(row.games);
  }

  deltaGames(row: ScoutRow): Delta | null {
    if (!row.then) {
      return null;
    }
    return signed(row.games - Math.round(row.then.stats.utility.gp), 0);
  }

  /** "+19" for places gained, "-4" for places lost, "0" for neither. */
  rise(row: ScoutRow): string {
    if (row.rise === null) {
      return '';
    }
    return row.rise > 0 ? `+${row.rise}` : `${row.rise}`;
  }

  riseTip(row: ScoutRow): string {
    if (row.thenRank === null) {
      return 'The model had no line for him on that day';
    }
    return `Ranked ${row.thenRank} of these players on the line of that day, ${row.rank} today`;
  }

  toiNow(row: ScoutRow): string {
    return formatToi(toiPerGame(row.line));
  }

  deltaToi(row: ScoutRow): Delta | null {
    const now = toiPerGame(row.line);
    const then = toiPerGame(row.then);
    if (now === undefined || then === undefined) {
      return null;
    }
    const change = now - then;
    return { text: formatIceChange(change), dir: direction(change, MORE_ICE_SECONDS) };
  }

  /** The change in a category since the day, in the category's own precision and sense. */
  deltaStat(row: ScoutRow, key: ScoringStatKey): Delta | null {
    if (!row.then || !row.scout.thenProjected.has(key)) {
      return null;
    }
    const now = statOf(row.line, key);
    const then = statOf(row.then, key);
    if (now === null || then === null) {
      return null;
    }
    const change = now - then;
    if (key === 'toi') {
      return { text: formatIceChange(change), dir: direction(change, MORE_ICE_SECONDS) };
    }
    const delta = signed(change, statDigits(key, now));
    // Fewer goals against is the better way; the colour follows the sense of the stat.
    return LOWER_IS_BETTER_SCORING_STAT_KEYS.has(key) ? flipped(delta) : delta;
  }

  // --- The ice since the day ------------------------------------------------------------------

  iceNow(row: ScoutRow): string {
    return row.usage ? formatIce(row.usage.recent.toiPerGame) : '';
  }

  deltaIce(row: ScoutRow): Delta | null {
    const change = row.usage?.iceChange ?? null;
    if (change === null) {
      return null;
    }
    return { text: formatIceChange(change), dir: direction(change, MIN_ICE_CHANGE_SECONDS) };
  }

  shareNow(row: ScoutRow): string {
    return row.usage ? formatShare(row.usage.recent.ppShare) : '';
  }

  deltaShare(row: ScoutRow): Delta | null {
    const change = row.usage?.powerPlayShareChange ?? null;
    if (change === null) {
      return null;
    }
    return {
      text: formatShareChange(change),
      dir: direction(change, MIN_POWER_PLAY_SHARE_CHANGE),
    };
  }

  iceTip(row: ScoutRow): string {
    const usage = row.usage;
    if (!usage) {
      return '';
    }
    const games = `${usage.recent.games} ${usage.recent.games === 1 ? 'game' : 'games'} since the day`;
    if (!usage.baseline) {
      return `${games}; nothing earlier to compare with`;
    }
    const before =
      usage.baselineSource === 'LAST_SEASON'
        ? `his ${usage.baseline.games} games last season`
        : `his ${usage.baseline.games} games before it`;
    return `${games}, against ${before}`;
  }

  /** "L2 · PP1", or "Out", or nothing: where the lineup page lists him now. */
  listedNow(row: ScoutRow): string {
    const now = row.usage?.listedNow;
    if (!now) {
      return '';
    }
    const line = lineLabel(now) ?? (now.outOfLineup ? 'Out' : '');
    const unit = now.powerPlayUnit ? `PP${now.powerPlayUnit}` : '';
    return [line, unit].filter(Boolean).join(' · ');
  }

  /** "was L4 · no PP" when the page listed him elsewhere on the day. */
  listedThen(row: ScoutRow): string {
    const usage = row.usage;
    if (!usage || (!usage.lineMove && !usage.powerPlayMove)) {
      return '';
    }
    const before = usage.listedBefore;
    const line = lineLabel(before) ?? (before?.outOfLineup ? 'Out' : '');
    const unit = before ? powerPlayLabel(before) : '';
    return `was ${[line, unit].filter(Boolean).join(' · ')}`;
  }

  listedDir(row: ScoutRow): 'up' | 'down' | 'flat' {
    const higher = row.usage?.listedHigher ?? null;
    if (higher === null) {
      return 'flat';
    }
    return higher ? 'up' : 'down';
  }

  listedTip(row: ScoutRow): string {
    const usage = row.usage;
    if (!usage?.listedNow) {
      return 'The lineup page does not list him';
    }
    const moved = [usage.lineMove, usage.powerPlayMove]
      .filter((move): move is NonNullable<typeof move> => move !== null)
      .map((move) => `${move.from} to ${move.to}`);
    return moved.length > 0
      ? `Daily Faceoff lists him ${moved.join(' and ')} since the day`
      : 'Where Daily Faceoff lists him, unchanged since the day';
  }

  // --- The swap ---------------------------------------------------------------------------------

  swap(row: ScoutRow): LineupSwap | null {
    return this.swaps()?.get(row.player.playerId) ?? null;
  }

  /** Whether the row is a player the user could pick up: one the league has available. */
  pickable(row: ScoutRow): boolean {
    return row.scout.owner === null;
  }

  /** "+12.4" for an upgrade, "-3.1" for none. */
  gain(swap: LineupSwap): string {
    return signed(swap.gain, this.scoreDigits()).text;
  }

  /** Who makes room: "for Jake Walman", "Hronek to IR", "open spot". */
  making(swap: LineupSwap): string {
    switch (swap.kind) {
      case 'open':
        return 'open spot';
      case 'reserve':
        return `${swap.move.player.name} to ${swap.move.slot}`;
      case 'drop':
        return `for ${swap.drop.name}`;
    }
  }

  swapTip(row: ScoutRow): string {
    const swap = this.swap(row);
    if (!swap) {
      return 'Nobody on your team of his kind the model can weigh against him';
    }
    if (swap.kind === 'open') {
      return 'You have an open roster spot: what his starts would add to your lineup over the rest of the season';
    }
    if (swap.kind === 'reserve') {
      return `Move ${swap.move.player.name} to ${swap.move.slot} and his roster spot takes this pickup: what the pickup's starts would add`;
    }
    return swap.gain > 0
      ? `Drop ${swap.drop.name} for him: the swap that leaves your lineup worth the most over the rest of the season, with every night's starters set`
      : `Not an upgrade: with ${swap.drop.name} dropped for him, the player whose going costs least, your lineup is worth less over the rest of the season`;
  }

  // --- The player cell ---------------------------------------------------------------------------

  onWaivers(row: ScoutRow): boolean {
    return row.player.availability === 'WAIVERS';
  }

  /** Who holds him, for a list of more than the wire: "FA", "Mine", or the team's name. */
  ownerTag(row: ScoutRow): string {
    const owner = row.scout.owner;
    if (!owner) {
      return 'FA';
    }
    return owner.mine ? 'Mine' : owner.teamName;
  }

  isNil(stat: LineStat): boolean {
    return stat.value === NO_RATE || Number(stat.value) === 0;
  }
}

/** A change written with its sign to so many decimals, flat when it rounds to nothing. */
function signed(change: number, digits: number): Delta {
  const text = change.toFixed(digits);
  if (Number(text) === 0) {
    return { text: `±${(0).toFixed(digits)}`, dir: 'flat' };
  }
  return { text: change > 0 ? `+${text}` : text, dir: change > 0 ? 'up' : 'down' };
}

/** Which way a change points once it is past the smallest worth colouring. */
function direction(change: number, least: number): Delta['dir'] {
  if (Math.abs(change) < least) {
    return 'flat';
  }
  return change > 0 ? 'up' : 'down';
}

function flipped(delta: Delta): Delta {
  const dir = { up: 'down', down: 'up', flat: 'flat' } as const;
  return { text: delta.text, dir: dir[delta.dir] };
}

/** The decimals a category's change is written to: a rate's own, else one, none past a hundred. */
function statDigits(key: ScoringStatKey, now: number): number {
  const rates: readonly string[] = RATE_STAT_KEYS;
  if (rates.includes(key)) {
    return DEFAULT_DECIMAL_SETTINGS[key];
  }
  return Math.abs(now) >= 100 ? 0 : 1;
}
