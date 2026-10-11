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
import { PLANNER_POSITIONS, PlannerPositionGroup } from '../streamer-planner/planner-free-agents';
import { lineupSeats } from '../streamer-planner/planner-lineup';
import {
  bestSwap,
  DropCandidate,
  dropCandidates,
  scoreTeam,
  Swap,
  TeamRoom,
  teamRoom,
  TeamRow,
} from './drop-candidates';
import { rankScout, ScoutKind, ScoutRow } from './scout-ranking';
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
 * in the same pool, gives the player to drop for him and what the team gains (`bestSwap`): the
 * lowest scorer whose loss leaves the lineup as full, judged against the league's lineup slots.
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

  readonly kind = signal<ScoutKind>('skater');

  setKind(kind: ScoutKind): void {
    this.kind.set(kind);
  }

  readonly positionOptions = PLANNER_POSITIONS;

  /** The positions the skaters are narrowed to. None is every position. */
  readonly positions = signal<ReadonlySet<PlannerPositionGroup>>(new Set());

  togglePosition(position: PlannerPositionGroup): void {
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
    return team?.teamName ?? 'Your team';
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

  /** Every available player of the kind on screen, best first on the rest of the season. */
  readonly ranked = computed<readonly ScoutRow[]>(() => {
    const list = this.list();
    if (!list) {
      return [];
    }
    const { rank, scoreOf } = this.ranker();
    const alongside = (this.team() ?? []).flatMap((player) =>
      player.projection ? [player.projection] : [],
    );
    return rankScout(list.players, this.kind(), rank, scoreOf, alongside);
  });

  /** The user's players of the kind on screen, scored in the same pool as the wire. */
  private readonly teamRows = computed<readonly TeamRow[]>(() => {
    const team = this.team();
    const list = this.list();
    if (!team || !list) {
      return [];
    }
    const { rank, scoreOf } = this.ranker();
    return scoreTeam(
      team,
      list.players.map((player) => player.freeAgent.projection),
      this.kind(),
      rank,
      scoreOf,
    );
  });

  /**
   * The league's lineup seats. Until its settings say, none: a drop is then judged on score alone,
   * since a guessed lineup would forbid swaps the league allows.
   */
  private readonly seats = computed(() => {
    const settings = this.settingsResource.hasValue() ? this.settingsResource.value() : null;
    return settings?.rosterSlots ? lineupSeats(settings.rosterSlots) : [];
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

  /** Whether the drops are judged against the league's lineup, or on score alone. */
  readonly lineupKnown = computed(() => this.seats().length > 0);

  readonly candidates = computed<readonly DropCandidate[]>(() =>
    dropCandidates(this.teamRows(), this.seats(), this.room()),
  );

  /** The user's players of the kind left out of the drops: on injured reserve, or not projected. */
  readonly keptOut = computed(() => {
    const rows = this.teamRows();
    return {
      reserve: rows.filter((row) => row.player.reserve).length,
      unprojected: rows.filter((row) => !row.player.reserve && row.score === null).length,
    };
  });

  /** Each available player's best swap, by his platform id; null when no drop keeps the lineup. */
  readonly swaps = computed<ReadonlyMap<string, Swap | null>>(() => {
    const team = this.teamRows();
    if (team.length === 0) {
      return new Map();
    }
    const seats = this.seats();
    const room = this.room();
    return new Map(
      this.ranked().map((row) => [
        row.player.playerId,
        bestSwap({ positions: row.player.positions, score: row.score }, team, seats, room),
      ]),
    );
  });

  readonly showSwaps = computed(() => this.teamStatus() === 'ready' && this.teamRows().length > 0);

  /** Only the pickups that beat a player the team could drop for them. */
  readonly upgradesOnly = signal(false);

  toggleUpgradesOnly(): void {
    this.upgradesOnly.update((on) => !on);
  }

  private isUpgrade(row: ScoutRow): boolean {
    return (this.swaps().get(row.player.playerId)?.gain ?? 0) > 0;
  }

  readonly upgradeCount = computed(() => this.ranked().filter((row) => this.isUpgrade(row)).length);

  readonly risingCount = computed(() => this.ranked().filter((row) => row.rising).length);

  readonly filtered = computed<readonly ScoutRow[]>(() => {
    const positions = this.positions();
    return this.ranked().filter(
      (row) =>
        (!this.risingOnly() || row.rising) &&
        (!this.upgradesOnly() || !this.showSwaps() || this.isUpgrade(row)) &&
        (this.kind() === 'goalie' ||
          positions.size === 0 ||
          row.player.positions.some((position) => positions.has(position as PlannerPositionGroup))),
    );
  });

  readonly emptyText = computed(() => {
    if (this.upgradesOnly() && this.showSwaps()) {
      return this.kind() === 'skater'
        ? 'No available skater here beats a player you could drop for him.'
        : 'No available goalie beats a goalie you could drop for him.';
    }
    if (this.risingOnly()) {
      return this.kind() === 'skater'
        ? 'No available skater here has risen far enough since the preseason projection.'
        : 'No available goalie has risen far enough since the preseason projection.';
    }
    return this.kind() === 'skater'
      ? 'No available skater at these positions has a projection.'
      : 'No available goalie has a projection.';
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

  /** Another kind, other positions or the rising switch is another list: back to its first page. */
  private readonly page = linkedSignal<unknown, number>({
    source: () => [
      this.kind(),
      this.positions(),
      this.risingOnly(),
      this.upgradesOnly(),
      this.league(),
    ],
    computation: () => 0,
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / SCOUT_PAGE_SIZE)),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  readonly visible = computed(() =>
    this.filtered().slice(
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

  /** "Any pickup", "Only for a D", "Only for a C or LW", "Needed in your lineup". */
  needsText(candidate: DropCandidate): string {
    if (!this.lineupKnown() || candidate.anyPickup) {
      return 'Any pickup';
    }
    if (candidate.needs.length === 0) {
      return 'Needed in your lineup';
    }
    return `Only for a ${candidate.needs.join(' or ')}`;
  }

  needsTip(candidate: DropCandidate): string {
    if (!this.lineupKnown()) {
      return "Your league's lineup isn't known yet, so this is on the projection alone";
    }
    if (candidate.anyPickup) {
      return 'Your lineup stays as full without him, whoever you pick up';
    }
    if (candidate.needs.length === 0) {
      return 'Every player who could replace him leaves a slot in your lineup empty';
    }
    return `Without him a ${candidate.needs.join(' or ')} slot in your lineup goes empty, so drop him only for a player who plays there`;
  }

  goToPage(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pageCount() - 1)));
  }
}
