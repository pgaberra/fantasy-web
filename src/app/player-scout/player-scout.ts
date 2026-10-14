import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { RosterSlots } from '../api/models/roster-slots';
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
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import { PlayerScoutService, ScoutSince, TeamPlayer } from '../services/player-scout.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
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
import { TeamRoom, teamRoom } from './drop-candidates';
import { LineupSwap, LineupValue, swapInto, valueLineup } from './lineup-value';
import {
  nextScoutSort,
  rankScout,
  SCOUT_MOVERS_ORDER,
  ScoutRow,
  ScoutSort,
  ScoutSortKey,
  sortScout,
} from './scout-ranking';
import { ScoutTableComponent } from './scout-table/scout-table';
import { daysBefore, formatDay, localToday, SincePickerComponent } from './since-picker/since-picker';

/** Players to a page: enough to reach well past a league's bench without a second page. */
export const SCOUT_PAGE_SIZE = 25;

/** The day the page opens on: a week back, the stretch a manager checks on between waiver runs. */
export const DEFAULT_SINCE_DAYS = 7;

/** Whose players the list shows: the league's available ones, the user's own, or everyone's. */
export type ScoutPool = 'available' | 'mine' | 'all';

/** Which way the model has moved on the players shown. */
export type ScoutMovers = 'all' | 'risers' | 'fallers';

/** One of the user's own players as the roster fold-out lists him. */
export interface RosterEntry {
  readonly player: TeamPlayer;
  /** His rest of the season scored by the league's settings; null when the model has no line. */
  readonly score: number | null;
  readonly value: LineupValue | null;
  /** The change in his score since the day; null without a then-line. */
  readonly delta: number | null;
  /**
   * Whether his place in the lineup could be weighed: the league's slots known, and his club's
   * nights too. A healthy player on a club the schedule does not know starts nowhere by our
   * reckoning, which is not the same as being worth nothing, so he is never the cheapest.
   */
  readonly weighed: boolean;
}

/**
 * Player Scout: how the model's view of every player in a league has moved since a chosen day,
 * and what the ice says about why. The FA scout's question (who on the wire is worth keeping) and
 * Role Changes' (whose job at his club just changed) in one page, asked of one day.
 *
 * <p>Every player the league holds, available or on a team, is ranked twice by the league's own
 * scoring settings: on the model's rest of the season today, and on its line for him as it
 * stood on the day, re-spread over the games his club has left. The distance between the two,
 * in score and in places, is what the list opens sorted by; beside it, each category's own
 * change, and the ice he has actually had since the day against the ice before it, so the
 * reader sees the why with the what.
 *
 * <p>The league is picked as the planner picks it, and opens on the league last chosen anywhere
 * ({@link LeagueChoiceService}). The user's own team is weighed night by night over the rest of
 * the season ({@link valueLineup}): the player to drop is the one whose going costs the lineup
 * least, which a third centre behind two centre seats makes plain, and each available player's
 * best swap is the one that leaves the lineup worth the most with him in it.
 */
@Component({
  selector: 'app-player-scout',
  imports: [
    ErrorStateComponent,
    HelpTipComponent,
    IconComponent,
    LeagueFieldComponent,
    LoadingIndicatorComponent,
    PositionChipsComponent,
    ScoutTableComponent,
    SincePickerComponent,
    TeamLogoComponent,
    TooltipDirective,
  ],
  templateUrl: './player-scout.html',
  styleUrl: './player-scout.css',
  providers: [YahooLeaguePicker],
})
export class PlayerScoutComponent {
  private readonly scoutService = inject(PlayerScoutService);
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

  // --- The day ---------------------------------------------------------------------------------

  readonly today = localToday();

  /** The day compared with, as an ISO date, or null for the model's preseason line. */
  readonly since = signal<string | null>(daysBefore(this.today, DEFAULT_SINCE_DAYS));

  private readonly scoutResource = rxResource({
    params: () => {
      const league = this.league();
      return league ? { league, since: this.since() } : undefined;
    },
    stream: ({ params }) =>
      this.scoutService.players(params.league.platform, params.league.leagueId, params.since),
  });

  private readonly settingsResource = rxResource({
    params: () => this.league() ?? undefined,
    stream: ({ params }) =>
      params.platform === 'YAHOO'
        ? this.yahoo.leagueProjectionSettings(params.leagueId)
        : this.espn.leagueProjectionSettings(params.leagueId),
  });

  /** The user's own team, read beside the league; its failure costs the drops, never the list. */
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

  /** What the BFF answered the day with; null until it has. */
  readonly sinceAnswer = computed<ScoutSince | null>(() => this.list()?.since ?? null);

  /** What the then-lines are, for the table's heading: "vs 7 Oct", "vs preseason". */
  readonly sinceLabel = computed(() => {
    const answer = this.sinceAnswer();
    if (!answer || answer.kind === 'NONE') {
      return 'no earlier line';
    }
    return answer.kind === 'SNAPSHOT' ? `vs ${formatDay(answer.resolved)}` : 'vs preseason';
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

  readonly pool = signal<ScoutPool>('available');
  readonly movers = signal<ScoutMovers>('all');
  readonly search = signal('');

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

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
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

  /** Every player in the league, skaters and goalies, best first on the rest of the season. */
  readonly ranked = computed<readonly ScoutRow[]>(() => {
    const list = this.list();
    if (!list) {
      return [];
    }
    const { rank, scoreOf } = this.ranker();
    return rankScout(list.players, rank, scoreOf);
  });

  /** The players whose owner the pool asks for. */
  private readonly inPool = computed<readonly ScoutRow[]>(() => {
    const pool = this.pool();
    return this.ranked().filter((row) => {
      switch (pool) {
        case 'available':
          return row.scout.owner === null;
        case 'mine':
          return row.scout.owner?.mine === true;
        case 'all':
          return true;
      }
    });
  });

  /** The players at the positions picked, movers or not. */
  private readonly atPositions = computed(
    () => filterByPositions(this.inPool(), this.positions()) as readonly ScoutRow[],
  );

  readonly risingCount = computed(() => this.atPositions().filter((row) => row.rising).length);

  readonly filtered = computed<readonly ScoutRow[]>(() => {
    const movers = this.movers();
    const needle = this.search().trim().toLowerCase();
    return this.atPositions().filter((row) => {
      const delta = row.delta ?? 0;
      if (movers === 'risers' && delta <= 0) {
        return false;
      }
      if (movers === 'fallers' && delta >= 0) {
        return false;
      }
      return !needle || row.player.name.toLowerCase().includes(needle);
    });
  });

  // --- The user's team --------------------------------------------------------------------------

  /** The user's team in this league, or null while it loads, fails or is not his. */
  private readonly team = computed<readonly TeamPlayer[] | null>(() => {
    const answer = this.teamResource.hasValue() ? this.teamResource.value() : null;
    return answer?.team.found ? answer.team.players : null;
  });

  /** Every club's remaining nights, by the NHL's spelling of the club. */
  private readonly schedule = computed<ReadonlyMap<string, readonly string[]>>(() => {
    const answer = this.teamResource.hasValue() ? this.teamResource.value() : null;
    return answer?.schedule ?? new Map();
  });

  readonly teamName = computed(() => {
    const answer = this.teamResource.hasValue() ? this.teamResource.value() : null;
    return answer?.team.teamName ?? null;
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

  private readonly slots = computed<RosterSlots | null>(
    () => (this.settingsResource.hasValue() ? this.settingsResource.value() : null)?.rosterSlots ?? null,
  );

  /** Whether the league's roster slots are known, so the lineup can be weighed at all. */
  readonly slotsKnown = computed(() => this.slots() !== null);

  /** Each of the user's players' score, from the league list, which scores everyone together. */
  private readonly ownScores = computed<ReadonlyMap<string, ScoutRow>>(() => {
    const rows = new Map<string, ScoutRow>();
    for (const row of this.ranked()) {
      if (row.scout.owner?.mine) {
        rows.set(row.player.playerId, row);
      }
    }
    return rows;
  });

  private readonly scoreOfOwn = computed(() => {
    const scores = this.ownScores();
    return (playerId: string) => scores.get(playerId)?.score ?? null;
  });

  /** The roster weighed night by night over the rest of the season; null while anything is missing. */
  readonly valuation = computed(() => {
    const team = this.team();
    const slots = this.slots();
    const schedule = this.schedule();
    if (!team || !slots || schedule.size === 0) {
      return null;
    }
    return valueLineup(team, slots, schedule, this.scoreOfOwn());
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
   * The user's players of the kind the positions pick, the one whose going costs the lineup
   * least first; those on injured reserve, whose spot a drop would not free, after the rest.
   */
  readonly roster = computed<readonly RosterEntry[]>(() => {
    const team = this.team();
    if (!team) {
      return [];
    }
    const shown = this.shown();
    const scores = this.ownScores();
    const valuation = this.valuation();
    return team
      .filter((player) => shown === 'players' || player.type === (shown === 'goalies' ? 'goalie' : 'skater'))
      .map((player) => {
        const row = scores.get(player.playerId);
        const value = valuation?.byPlayer.get(player.playerId) ?? null;
        return {
          player,
          score: row?.score ?? null,
          value,
          delta: row?.delta ?? null,
          weighed: valuation === null || value === null || value.games > 0 || player.out,
        };
      })
      .sort(
        (a, b) =>
          Number(a.player.reserve) - Number(b.player.reserve) ||
          Number(a.score === null) - Number(b.score === null) ||
          Number(!a.weighed) - Number(!b.weighed) ||
          (a.value?.marginal ?? a.score ?? 0) - (b.value?.marginal ?? b.score ?? 0) ||
          (a.score ?? 0) - (b.score ?? 0),
      );
  });

  /** The player to drop: of those holding a spot the model can weigh, the cheapest to the lineup. */
  readonly cheapest = computed<RosterEntry | null>(
    () =>
      this.roster().find(
        (entry) => !entry.player.reserve && entry.score !== null && entry.weighed,
      ) ?? null,
  );

  /** Whether the roster is unfolded under the room line; folded on every visit and league. */
  readonly rosterOpen = linkedSignal<unknown, boolean>({
    source: () => this.league(),
    computation: () => false,
  });

  toggleRoster(): void {
    this.rosterOpen.update((open) => !open);
  }

  /** "48 / 71": the nights he starts in the lineup, of the nights his club plays. */
  starts(entry: RosterEntry): string {
    if (!entry.value || !entry.weighed) {
      return '';
    }
    return `${entry.value.starts} / ${entry.value.games}`;
  }

  /** What the ice columns are measured since, for the table's heading. */
  readonly iceLabel = computed(() => {
    const since = this.since();
    return since === null ? 'this season' : `since ${formatDay(since)}`;
  });

  // --- The order of the list --------------------------------------------------------------------

  /** The column the list was last sorted by; it opens on the players the model has moved most. */
  private readonly sortPicked = signal<ScoutSort>(SCOUT_MOVERS_ORDER);

  /**
   * The order on screen: the one picked, while its column is still in the table. A category the
   * league does not score, or ice time with no skater listed, falls back to the movers' order
   * rather than sorting by blanks.
   */
  readonly sort = computed<ScoutSort>(() => {
    const sort = this.sortPicked();
    const about: readonly ScoutSortKey[] =
      this.shown() !== 'goalies'
        ? ['name', 'score', 'delta', 'rise', 'games', 'toi', 'ice', 'powerPlay']
        : ['name', 'score', 'delta', 'rise', 'games'];
    return about.includes(sort.key) || this.categories().includes(sort.key as ScoringStatKey)
      ? sort
      : SCOUT_MOVERS_ORDER;
  });

  /** Sorts the whole list by a column, best first; the same column again turns it round. */
  sortBy(key: ScoutSortKey): void {
    this.sortPicked.set(nextScoutSort(this.sort(), key));
  }

  /** The list in the order asked for, before it is cut into pages. */
  readonly sorted = computed(() => sortScout(this.filtered(), this.sort()));

  readonly emptyText = computed(() => {
    const who = {
      available: 'No available player',
      mine: 'None of your players',
      all: 'No player',
    }[this.pool()];
    const where = this.positions().size === 0 ? '' : ' at these positions';
    switch (this.movers()) {
      case 'risers':
        return `${who}${where} has risen in the projection since the day.`;
      case 'fallers':
        return `${who}${where} has fallen in the projection since the day.`;
      default:
        return this.search().trim()
          ? `${who}${where} matches the search.`
          : `${who}${where} has a projection.`;
    }
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

  /** Another pool, other positions, another day or order is another list: back to its first page. */
  private readonly page = linkedSignal<unknown, number>({
    source: () => [
      this.pool(),
      this.positions(),
      this.movers(),
      this.search(),
      this.league(),
      this.since(),
      this.sort(),
    ],
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

  goToPage(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pageCount() - 1)));
  }

  // --- The swaps -------------------------------------------------------------------------------

  /**
   * Each available player on the page's best swap into the user's lineup. Only the rows on
   * screen are weighed, since each is the lineup set night by night for every drop, and only
   * while the team, its slots and the schedule are all known.
   */
  readonly swaps = computed<ReadonlyMap<string, LineupSwap | null> | null>(() => {
    const team = this.team();
    const slots = this.slots();
    const schedule = this.schedule();
    if (!team || !slots || schedule.size === 0 || this.pool() === 'mine') {
      return null;
    }
    const room = this.room();
    const score = this.scoreOfOwn();
    const swaps = new Map<string, LineupSwap | null>();
    for (const row of this.visible()) {
      if (row.scout.owner === null) {
        swaps.set(
          row.player.playerId,
          swapInto(
            {
              playerId: row.player.playerId,
              positions: row.player.positions,
              teamAbbrev: row.player.teamAbbrev,
              score: row.score,
            },
            team,
            slots,
            schedule,
            score,
            room,
          ),
        );
      }
    }
    return swaps;
  });

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

  /** "+2.4" / "-1.1" for a change in score. */
  formatDelta(delta: number | null): string {
    if (delta === null) {
      return '';
    }
    const text = delta.toFixed(this.scoringType() === 'points' ? 1 : 2);
    return delta > 0 ? `+${text}` : text;
  }
}
