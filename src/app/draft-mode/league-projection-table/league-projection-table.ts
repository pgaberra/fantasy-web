import { Component, computed, effect, ElementRef, input, signal, viewChild } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { IconComponent, type IconName } from '../../shared/icon/icon';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { shortNames } from '../../shared/short-name';
import { SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';
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
 * Diverging heat scale for the stat and total cells: the column leader trends teal, the laggard
 * a warm orange, and the mid-pack stays clear — so a glance down any column shows who's strongest
 * there. Every value is already "higher is better" (weighted-points / z-score contributions,
 * direction included), so one direction works for every column.
 *
 * The pair is teal and orange rather than the success green and error red it started as: thinned
 * to a wash those two came out mint and pink, which read as decoration, and they are the pair a
 * red-green colour-blind reader cannot tell apart. Teal and orange keep "good is the green side"
 * and differ in blue as well as in red. Inlined because the per-cell alpha is computed.
 */
const HEAT_LEADER_RGB = '13, 148, 136';
const HEAT_LAGGARD_RGB = '234, 88, 12';
const HEAT_LEADER_MAX_ALPHA = 0.3;
const HEAT_LAGGARD_MAX_ALPHA = 0.26;

const SKATER_STAT_KEYS: ReadonlySet<string> = new Set(SKATER_SCORING_STAT_KEYS);

@Component({
  selector: 'app-league-projection-table',
  imports: [TooltipDirective, IconComponent, PositionChipsComponent, TeamLogoComponent],
  templateUrl: './league-projection-table.html',
  styleUrl: './league-projection-table.css',
})
export class LeagueProjectionTableComponent {
  readonly data = input.required<LeagueProjectionData>();
  readonly scoringType = input.required<ScoringType>();
  readonly scoreHeading = input.required<string>();
  /**
   * Whether a team opens to show its players. False where the numbers came back without them —
   * a league power-ranked for an account that has not paid for the lines behind the totals —
   * so the table offers nothing it cannot deliver. Whoever passes false says why on their own page.
   */
  readonly expandable = input<boolean>(true);

  readonly injuredReserveTooltip =
    "On injured reserve: holds no roster spot, and counts only if he is among the team's best";
  readonly notActiveTooltip =
    "Not active: holds no roster spot, and counts only if he is among the team's best";
  readonly notCountedTooltip =
    'Not counted: a team counts its best players, as many as its roster holds, and he is not among them';

  readonly mode = signal<BreakdownMode>('category');
  readonly sortKey = signal<string>('total');
  readonly sortDir = signal<'asc' | 'desc'>('desc');

  /** Teams are expanded independently — any number of them can be open at once. */
  readonly expandedTeamIds = signal<ReadonlySet<string>>(new Set());
  /** Which of those teams have their full roster revealed. Tracked per team, so "show all" on one
      team doesn't spill into another's list. */
  readonly showAllTeamIds = signal<ReadonlySet<string>>(new Set());

  private readonly scrollWrap = viewChild<ElementRef<HTMLElement>>('scrollWrap');

  /** True while more columns lie off the right edge — casts the pinned score column's shadow, so
      the columns scrolled under it read as hidden rather than missing. */
  readonly canScrollRight = signal<boolean>(false);

  constructor() {
    // Recompute the edge whenever the box or the table inside it changes size: a window resize,
    // expanding a team (which widens the position cells), switching breakdown, new data, and the
    // web font arriving after first paint, which a render hook alone would miss.
    effect((onCleanup) => {
      const wrap = this.scrollWrap()?.nativeElement;
      if (!wrap || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.updateScrollEdge());
      observer.observe(wrap);
      if (wrap.firstElementChild) {
        observer.observe(wrap.firstElementChild);
      }
      onCleanup(() => observer.disconnect());
    });
  }

  /** Bound to the scroll container's scroll event. */
  onScroll(): void {
    this.updateScrollEdge();
  }

  private updateScrollEdge(): void {
    const wrap = this.scrollWrap()?.nativeElement;
    if (!wrap) {
      return;
    }
    const maxScrollLeft = wrap.scrollWidth - wrap.clientWidth;
    this.canScrollRight.set(maxScrollLeft > 1 && wrap.scrollLeft < maxScrollLeft - 1);
  }

  readonly columns = computed(() =>
    this.mode() === 'category' ? this.data().categoryColumns : this.data().positionColumns,
  );

  /**
   * The first goalie stat after the skaters', which a rule is drawn in front of: the two halves of
   * the table are different players' columns, and a goalie's row is empty under one of them.
   * Null where the league counts only one kind, and in the position breakdown.
   */
  readonly groupStartKey = computed(() => {
    if (this.mode() !== 'category') {
      return null;
    }
    const keys = this.columns().map((column) => column.key);
    const firstGoalie = keys.findIndex((key) => !SKATER_STAT_KEYS.has(key));
    return firstGoalie > 0 ? keys[firstGoalie] : null;
  });

  /**
   * Whether the rows came with the players' clubs, and so whether a crest leads each name. All
   * or nothing: a crest on some rows and a gap on others would misalign the names.
   */
  readonly showsClubs = computed(() =>
    this.data().teams.some((team) => team.roster.some((player) => !!player.team)),
  );

  /** Each team's best contribution per column, which is the one figure a player row stresses. */
  private readonly teamBests = computed(() => {
    const bests = new Map<string, Record<string, number>>();
    for (const team of this.data().teams) {
      const best: Record<string, number> = {};
      for (const player of team.roster) {
        for (const [key, contribution] of Object.entries(player.contributions)) {
          if (contribution !== null && (best[key] === undefined || contribution > best[key])) {
            best[key] = contribution;
          }
        }
      }
      bests.set(team.teamId, best);
    }
    return bests;
  });

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

  /**
   * Whether a player row on screen is one the team does not count. Such a row shows what he would
   * be worth, marked, rather than the nothing he adds, and the table then says why under it.
   */
  readonly showsUncountedNote = computed(() =>
    this.sortedTeams().some(
      (team) =>
        this.isExpanded(team.teamId) &&
        this.showsRosterRows() &&
        this.rosterRows(team).some((player) => this.shownAsUncounted(player)),
    ),
  );

  shownAsUncounted(player: LeagueProjectionRosterRow): boolean {
    return player.counted === false && player.fullValue !== undefined;
  }

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

  /**
   * Whether nobody on the team gives it more in this column than this player. A roster is sixteen
   * rows of ten numbers, and what a reader looks for in it is who carries each column.
   */
  isTeamBest(
    team: LeagueProjectionTeamRow,
    player: LeagueProjectionRosterRow,
    key: string,
  ): boolean {
    const contribution = player.contributions[key];
    return (
      contribution !== null &&
      team.roster.length > 1 &&
      contribution === this.teamBests().get(team.teamId)?.[key]
    );
  }

  /**
   * What the lineup row needs to know about a team's players besides the slot each fills: his
   * club, and his name short enough for a slot's column ("M. Samuelsson"). A slot's players come
   * as a name and a value, so both are looked up by name in the team's own roster; two players
   * of one name on one team would share a crest, which is the worst it can do.
   */
  private readonly lineupDetails = computed(() => {
    const details = new Map<
      string,
      { clubs: Map<string, string | null>; short: Map<string, string> }
    >();
    for (const team of this.data().teams) {
      const names = Object.values(team.positionPlayers).flatMap((players) =>
        players.map((player) => player.name),
      );
      details.set(team.teamId, {
        clubs: new Map(team.roster.map((row) => [row.name, row.team ?? null])),
        short: shortNames(names),
      });
    }
    return details;
  });

  /** The club of a player in the team's lineup, for the crest beside his name. */
  clubOf(team: LeagueProjectionTeamRow, name: string): string | null {
    return this.lineupDetails().get(team.teamId)?.clubs.get(name) ?? null;
  }

  /** A lineup player's name as his slot's column has room for it. */
  slotName(team: LeagueProjectionTeamRow, name: string): string {
    return this.lineupDetails().get(team.teamId)?.short.get(name) ?? name;
  }

  /** Players listed under a position column when its team is expanded. */
  cellPlayers(
    team: LeagueProjectionTeamRow,
    column: LeagueProjectionColumn,
  ): LeagueProjectionContributor[] {
    return team.positionPlayers[column.key] ?? [];
  }

  toggleExpand(teamId: string): void {
    if (!this.expandable()) {
      return;
    }
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

  sortIndicator(key: string): IconName | null {
    if (this.sortKey() !== key) {
      return null;
    }
    return this.sortDir() === 'desc' ? 'arrow-down' : 'arrow-up';
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
