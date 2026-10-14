import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
} from '../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../draft-projection/projection-settings-section/model';
import { Projection, ScoredProjection } from '../models/projection.model';
import { isAllSkaters } from '../models/position.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { FaScoutService, TeamPlayer } from '../services/fa-scout.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { Platform } from '../shared/platform-tabs/platform-tabs';
import { PositionChipsComponent } from '../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../shared/team-logo/team-logo';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { LeagueFieldComponent } from '../streamer-planner/league-field/league-field';
import {
  FREE_AGENT_POSITIONS,
  FreeAgentPosition,
  filterByPositions,
  PLANNER_POSITIONS,
} from '../streamer-planner/planner-free-agents';
import { scoreTeam, TeamRoom, teamRoom, TeamRow } from './drop-candidates';
import {
  nextScoutSort,
  rankScout,
  SCOUT_RANKED_ORDER,
  ScoutRow,
  ScoutSort,
  ScoutSortKey,
  sortScout,
} from './scout-ranking';
import { ScoutTableComponent } from './scout-table/scout-table';

/** Players to a page: enough to reach well past a league's bench without a second page. */
export const SCOUT_PAGE_SIZE = 25;

/**
 * The FA scout: the players a league has available who are worth keeping for the rest of the
 * season. Where the streamer planner finds a player for the next few nights, this finds the one
 * the league would draft if it drafted again today: traded into a bigger role, or given more ice
 * and the first power play than anyone expected in September.
 *
 * <p>Every available player is ranked twice by the league's own scoring settings: on the model's
 * rest of the season, which is the order of the list, and on the line the model gave him before
 * the season began. The places he has gained between the two say how far the season has moved him
 * past where the draft left him, and a player risen far enough is tagged Rising (`isRising`).
 *
 * <p>The league is picked as the planner picks it, with the same field (Yahoo / ESPN tabs), and
 * opens on the league last chosen anywhere ({@link LeagueChoiceService}): a reader scouting a
 * league for keepers is the one streaming in it.
 *
 * <p>A pickup needs a roster spot. An open one is taken first, then the spot of an injured player
 * who can move to a free injured-reserve slot (`teamRoom`). Otherwise the user's own team, scored
 * in the same pool as the wire, says what a pickup costs in one line above the list: his lowest
 * droppable player, the floor an available player has to clear. The roster itself is folded under
 * that line, opened on demand, and opens on the players a listed pickup outscores (`beatable`),
 * since the ones nobody on the wire beats are not the ones anyone drops.
 */
@Component({
  selector: 'app-fa-scout',
  imports: [
    ErrorStateComponent,
    HelpTipComponent,
    IconComponent,
    LeagueFieldComponent,
    LoadingIndicatorComponent,
    PositionChipsComponent,
    ScoutTableComponent,
    TeamLogoComponent,
    TooltipDirective,
  ],
  templateUrl: './fa-scout.html',
  styleUrl: './fa-scout.css',
  providers: [YahooLeaguePicker],
})
export class FaScoutComponent {
  private readonly scoutService = inject(FaScoutService);
  private readonly picker = inject(YahooLeaguePicker);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);

  constructor() {
    this.picker.start();
  }

  // --- The league, picked as the planner picks it ---------------------------------------------

  /** Whether ESPN leagues are offered at all: where the planner and Team Power Rankings offer them. */
  private readonly espnOffered = environment.espnLeaguesEnabled;
  private readonly remembered = inject(LeagueChoiceService).league();

  /** Which platform's league the players come from: last time's, else Yahoo. */
  readonly platform = signal<Platform>(
    this.espnOffered && this.remembered?.platform === 'ESPN' ? 'espn' : 'yahoo',
  );

  /** The ESPN league ESPN last accepted, kept while the reader looks at Yahoo's. */
  readonly espnLeague = signal<ChosenLeague | null>(
    this.espnOffered && this.remembered?.platform === 'ESPN' ? this.remembered : null,
  );

  /** The league the players are read from: the tab's, equal by platform and id alone. */
  readonly league = computed<ChosenLeague | null>(
    () => {
      if (this.platform() === 'espn') {
        return this.espnLeague();
      }
      const key = this.picker.selectedKey();
      return key
        ? { platform: 'YAHOO', leagueId: key, name: this.picker.selectedLeague()?.name ?? key }
        : null;
    },
    { equal: (a, b) => a?.platform === b?.platform && a?.leagueId === b?.leagueId },
  );

  private readonly scoutResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) => this.scoutService.freeAgents(params.platform, params.leagueId),
  });

  private readonly settingsResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) =>
      params.platform === 'YAHOO'
        ? this.yahoo.leagueProjectionSettings(params.leagueId)
        : this.espn.leagueProjectionSettings(params.leagueId),
  });

  /** The user's own team, read beside the wire; its failure costs the drops, never the list. */
  private readonly teamResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) => this.scoutService.myTeam(params.platform, params.leagueId),
  });

  readonly loading = computed(
    () => this.scoutResource.isLoading() || this.settingsResource.isLoading(),
  );
  readonly failure = computed(() => this.scoutResource.error() ?? this.settingsResource.error());

  retryTeam(): void {
    this.teamResource.reload();
  }

  retry(): void {
    if (this.settingsResource.error()) {
      this.settingsResource.reload();
    }
    if (this.scoutResource.error()) {
      this.scoutResource.reload();
    }
  }

  private readonly list = computed(() =>
    this.scoutResource.hasValue() ? this.scoutResource.value() : null,
  );

  /** The season has not started, or is over: there is no rest of it to scout. */
  readonly outOfSeason = computed(() => this.list()?.inSeason === false);

  /** The preseason line is not stored, so the list ranks but nobody can read as rising. */
  readonly noPreseason = computed(() => {
    const list = this.list();
    return !!list && list.inSeason && !list.preseasonAvailable;
  });

  /** The league's own scoring, or the app's defaults until its settings land. */
  private readonly scoring = computed(() => {
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    return {
      scoringType: settings?.scoringType ?? 'points',
      statWeights: {
        ...DEFAULT_STAT_WEIGHTS,
        ...((settings?.statWeights ?? {}) as Record<ScoringStatKey, number>),
      },
      activeScoringColumns: new Set(
        (settings?.activeScoringColumns as ScoringStatKey[] | undefined) ?? DEFAULT_SCORING_COLUMNS,
      ),
    };
  });

  readonly scoringType = computed(() => this.scoring().scoringType);

  readonly categories = computed<readonly ScoringStatKey[]>(() => [
    ...this.scoring().activeScoringColumns,
  ]);

  // --- What the list shows ----------------------------------------------------------------------

  readonly positionOptions = FREE_AGENT_POSITIONS;

  /** The positions the list is narrowed to, G among them. None is every player. */
  readonly positions = signal<ReadonlySet<FreeAgentPosition>>(new Set());

  togglePosition(position: FreeAgentPosition): void {
    this.positions.update((positions) => {
      const next = new Set(positions);
      if (!next.delete(position)) {
        next.add(position);
      }
      return next;
    });
  }

  clearPositions(): void {
    this.positions.set(new Set());
  }

  /** Every skater position picked, and nothing else: what the "All skaters" shortcut shows. */
  readonly allSkaters = computed(() => isAllSkaters([...this.positions()]));

  /** Picks the four skater positions at once; pressed again, goes back to everyone. */
  toggleAllSkaters(): void {
    this.positions.set(this.allSkaters() ? new Set() : new Set(PLANNER_POSITIONS));
  }

  /** Who the positions picked are: skaters, goalies, or both, as none picked is. */
  readonly shown = computed<'skaters' | 'goalies' | 'players'>(() => {
    const positions = this.positions();
    const goalies = positions.has('G');
    if (positions.size === 0 || (goalies && positions.size > 1)) {
      return 'players';
    }
    return goalies ? 'goalies' : 'skaters';
  });

  /** One of the kind shown: "player", "skater" or "goalie". */
  readonly one = computed(() => this.shown().slice(0, -1));

  /** Only the players tagged Rising: the ones the page is for, without the rest of the wire. */
  readonly risingOnly = signal(false);

  toggleRisingOnly(): void {
    this.risingOnly.update((on) => !on);
  }

  /** Ranks lines by the league's scoring, best first, and the score each is ranked by. */
  private readonly ranker = computed(() => {
    const scoring = this.scoring();
    const rank = (projections: Projection[]): ScoredProjection[] =>
      this.ranking.rankOverall({
        projections,
        scoringType: scoring.scoringType,
        statWeights: scoring.statWeights,
        activeScoringColumns: scoring.activeScoringColumns,
        leagueSize: DEFAULT_LEAGUE_SIZE,
        rosterSlots: DEFAULT_ROSTER_SLOTS,
        // A goalie on the wire is rarely anyone's starter, and the season minimum is there to keep
        // a backup off a season table. Applied here it would rank most of them out of the list.
        minGoalieGames: 0,
        decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      });
    const scoreOf = (entry: ScoredProjection) =>
      scoring.scoringType === 'points' ? entry.score.fantasyPoints : entry.score.zScore;
    return { rank, scoreOf };
  });

  /** The user's team in this league, or null while it loads, fails or is not his. */
  private readonly team = computed<readonly TeamPlayer[] | null>(() => {
    const team = this.teamResource.hasValue() ? this.teamResource.value() : null;
    return team?.found ? team.players : null;
  });

  readonly teamName = computed(() => {
    const team = this.teamResource.hasValue() ? this.teamResource.value() : null;
    return team?.teamName ?? null;
  });

  readonly teamStatus = computed<'loading' | 'error' | 'not-found' | 'ready'>(() => {
    if (this.teamResource.error()) {
      return 'error';
    }
    if (this.teamResource.isLoading()) {
      return 'loading';
    }
    return this.team() ? 'ready' : 'not-found';
  });

  readonly teamFailure = computed(() => this.teamResource.error());

  /** Every available player, skaters and goalies, best first on the rest of the season. */
  readonly ranked = computed<readonly ScoutRow[]>(() => {
    const list = this.list();
    if (!list) {
      return [];
    }
    const { rank, scoreOf } = this.ranker();
    const alongside = (this.team() ?? []).flatMap((player) =>
      player.projection ? [player.projection] : [],
    );
    return rankScout(list.players, rank, scoreOf, alongside);
  });

  /** Every one of the user's players, scored in the same pool as the wire. */
  private readonly scoredTeam = computed<readonly TeamRow[]>(() => {
    const team = this.team();
    const list = this.list();
    if (!team || !list) {
      return [];
    }
    const { rank, scoreOf } = this.ranker();
    return scoreTeam(
      team,
      list.players.map((player) => player.freeAgent.projection),
      rank,
      scoreOf,
    );
  });

  /**
   * The user's players of the kind the positions pick: skaters for skater positions, goalies for
   * G, the whole team for both or none. A goalie is not dropped for a skater, so the drops follow
   * the wire on screen; within skaters every one stays, since any may be dropped for any.
   */
  private readonly teamRows = computed<readonly TeamRow[]>(() => {
    const shown = this.shown();
    const rows = this.scoredTeam();
    if (shown === 'players') {
      return rows;
    }
    const type = shown === 'goalies' ? 'goalie' : 'skater';
    return rows.filter((row) => row.player.type === type);
  });

  /** Room for a pickup with nobody dropped: open roster spots, injured players to move to IR. */
  readonly room = computed<TeamRoom>(() => {
    const team = this.team();
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    if (!team) {
      return { openSpots: 0, toReserve: [] };
    }
    return teamRoom(team, settings?.rosterSlots ?? null, settings?.reserveSlots ?? {});
  });

  /**
   * The user's players of the kind, lowest first, so the whole roster reads against itself: those
   * on injured reserve too, marked by their slot, though dropping them frees no spot.
   */
  readonly roster = computed<readonly TeamRow[]>(() =>
    this.teamRows()
      .filter((row) => row.score !== null)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
  );

  /** The user's players on screen the model has no line for: left out of the list. */
  readonly unprojected = computed(() => this.teamRows().filter((row) => row.score === null).length);

  /** Whether the league's roster slots are known, so a full roster can be called full. */
  readonly slotsKnown = computed(
    () => !!(this.settingsResource.hasValue() ? this.settingsResource.value() : null)?.rosterSlots,
  );

  /**
   * The floor: the user's lowest-scored player of the kind who holds a roster spot. An available
   * player above him is an upgrade; one below is not. Players on injured reserve hold no spot, so
   * none of them is the floor however low he scores.
   */
  readonly floor = computed<TeamRow | null>(
    () => this.roster().find((row) => !row.player.reserve) ?? null,
  );

  /** The best score among the available players on screen, by kind: what a pickup can offer. */
  private readonly wireTop = computed(() => {
    const top: Record<'skater' | 'goalie', number | null> = { skater: null, goalie: null };
    for (const row of this.filtered()) {
      const kind = row.line.type;
      top[kind] = Math.max(top[kind] ?? -Infinity, row.score);
    }
    return top;
  });

  /**
   * The user's players a listed pickup would outscore, lowest first: those off injured reserve
   * whose score is under the best available player of their kind on screen. The rest of the
   * roster nobody in the list beats, so nobody drops them for anyone in it.
   */
  readonly beatable = computed<readonly TeamRow[]>(() => {
    const top = this.wireTop();
    return this.roster().filter((row) => {
      const best = top[row.player.type];
      return !row.player.reserve && best !== null && (row.score ?? 0) < best;
    });
  });

  /** Whether the roster is unfolded under the room line; folded on every visit and league. */
  readonly rosterOpen = linkedSignal<unknown, boolean>({
    source: () => this.league(),
    computation: () => false,
  });

  toggleRoster(): void {
    this.rosterOpen.update((open) => !open);
  }

  /** Whether the whole roster is shown rather than the beatable players; back to fewer per league. */
  readonly showAllRoster = linkedSignal<unknown, boolean>({
    source: () => this.league(),
    computation: () => false,
  });

  /** The roster rows on screen: the beatable ones, or every one once Show all is pressed. */
  readonly rosterShown = computed<readonly TeamRow[]>(() =>
    this.showAllRoster() ? this.roster() : this.beatable(),
  );

  /** How many of the roster the fold is hiding. */
  readonly rosterHidden = computed(() => this.roster().length - this.rosterShown().length);

  /** The players at the positions picked, rising or not. */
  private readonly atPositions = computed(
    () => filterByPositions(this.ranked(), this.positions()) as readonly ScoutRow[],
  );

  readonly risingCount = computed(() => this.atPositions().filter((row) => row.rising).length);

  readonly filtered = computed<readonly ScoutRow[]>(() =>
    this.risingOnly() ? this.atPositions().filter((row) => row.rising) : this.atPositions(),
  );

  // --- The order of the list --------------------------------------------------------------------

  /** The column the list was last sorted by; it opens ranked, best first on the rest of the season. */
  private readonly sortPicked = signal<ScoutSort>(SCOUT_RANKED_ORDER);

  /**
   * The order on screen: the one picked, while its column is still in the table. A category the
   * league does not score, or ice time with no skater listed, falls back to the ranked order rather
   * than sorting by blanks.
   */
  readonly sort = computed<ScoutSort>(() => {
    const sort = this.sortPicked();
    const about: readonly ScoutSortKey[] =
      this.shown() !== 'goalies'
        ? ['name', 'score', 'rise', 'games', 'toi']
        : ['name', 'score', 'rise', 'games'];
    return about.includes(sort.key) || this.categories().includes(sort.key as ScoringStatKey)
      ? sort
      : SCOUT_RANKED_ORDER;
  });

  /** Sorts the whole list by a column, best first; the same column again turns it round. */
  sortBy(key: ScoutSortKey): void {
    this.sortPicked.set(nextScoutSort(this.sort(), key));
  }

  /** The list in the order asked for, before it is cut into pages. */
  readonly sorted = computed(() => sortScout(this.filtered(), this.sort()));

  readonly emptyText = computed(() => {
    const who =
      this.positions().size === 0
        ? 'No available player'
        : 'No available player at these positions';
    return this.risingOnly()
      ? `${who} has risen far enough since the preseason projection.`
      : `${who} has a projection.`;
  });

  readonly noPlayers = computed(
    () =>
      !!this.league() &&
      !this.loading() &&
      !this.failure() &&
      !this.outOfSeason() &&
      (this.list()?.players.length ?? 0) === 0,
  );

  // --- The pages of the list --------------------------------------------------------------------

  /**
   * Other positions, the rising switch or another order is another list: back to its first page.
   */
  private readonly page = linkedSignal<unknown, number>({
    source: () => [this.positions(), this.risingOnly(), this.league(), this.sort()],
    computation: () => 0,
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / SCOUT_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  readonly visible = computed(() =>
    this.sorted().slice(
      this.currentPage() * SCOUT_PAGE_SIZE,
      (this.currentPage() + 1) * SCOUT_PAGE_SIZE,
    ),
  );

  readonly rangeText = computed(() => {
    const total = this.filtered().length;
    const first = this.currentPage() * SCOUT_PAGE_SIZE + 1;
    const last = first + this.visible().length - 1;
    return first === last ? `${first} of ${total}` : `${first}–${last} of ${total}`;
  });

  // --- The drops -------------------------------------------------------------------------------

  /** "1 open roster spot", "2 open roster spots". */
  openSpotsText(count: number): string {
    return count === 1 ? '1 open roster spot' : `${count} open roster spots`;
  }

  formatScore(score: number | null): string {
    if (score === null) {
      return '';
    }
    return score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  goToPage(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pageCount() - 1)));
  }
}
