import {
  Component,
  computed,
  effect,
  ElementRef,
  DestroyRef,
  HostListener,
  inject,
  linkedSignal,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, exhaustMap, filter, forkJoin, map, of, Subscription, timer } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { freeNameFrom } from '../services/projection-name';
import { NotificationService } from '../services/notification.service';
import { FeatureService } from '../services/feature.service';
import {
  PositionTiers,
  TierBadge,
  TierPosition,
  TierService,
  TIER_POSITIONS,
} from '../services/tier.service';
import { RosterSlots } from '../api/models/roster-slots';
import { environment } from '../../environments/environment';
import { YahooService } from '../services/yahoo.service';
import { LeagueDraftResponse } from '../api/models/league-draft-response';
import { AnalyticsService } from '../services/analytics.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService, RankingInput } from '../services/projection-ranking.service';
import { PositionFilterService } from '../services/position-filter.service';
import { Player } from '../models/player.model';
import { applyPositionOverrides } from '../models/position-override';
import {
  PositionFilter,
  Projection,
  ScoredProjection,
  StatWeights,
} from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { DraftState } from '../api/models/draft-state';
import { ProjectionData } from '../api/models/projection-data';
import { ProjectionResponse } from '../api/models/projection-response';
import { UpdateProjectionData } from '../api/models/update-projection-data';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { StatInfoService } from '../services/stat-info.service';
import { DraftSettings } from '../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import {
  draftLeagueFromHistory,
  draftSettingsFromProjection,
} from '../shared/league-settings/league-settings';
import { Preset, presetById } from '../models/preset';
import { isPremiumRefusal, PREMIUM_REFUSED_MESSAGE } from '../shared/premium/premium-refused';
import {
  createDefaultProjectionState,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../draft-projection/projection-defaults';
import { DecimalStatKey } from '../draft-projection/projection-settings-section/model';
import { readableDecimalSettings } from '../draft-projection/projection-settings-section/model-decimals';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { DraftRosterService } from './draft-roster.service';
import { DraftSnakeService } from './draft-snake.service';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup/draft-setup';
import { YahooSyncResult } from '../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from '../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { DraftRosterPanelComponent } from './draft-roster-panel/draft-roster-panel';
import { DraftAvailablePanelComponent } from './draft-available-panel/draft-available-panel';
import { DraftPicksPanelComponent } from './draft-picks-panel/draft-picks-panel';
import { DraftSummaryComponent } from './draft-summary/draft-summary';
import { IconComponent } from '../shared/icon/icon';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import {
  buildLeagueProjection,
  LeagueProjectionData,
  LeagueProjectionPlayer,
  LeagueProjectionTeamInput,
} from './league-projection';
import {
  boardFromLeagueDraft,
  isLeagueBoard,
  sameBoard,
  UnfollowableReason,
  unfollowableReason,
} from './league-draft-follow';

const DEFAULT_PAGE_SIZE = 50;
const FOLLOW_POLL_MS = 5000;

/** One position's line in the tier strip: the best tier left there, and how much of it. */
export interface TierStripEntry {
  readonly position: TierPosition;
  readonly tier: number;
  readonly remaining: number;
  /** Whether the roster still has a slot this position could fill. */
  readonly needed: boolean;
}

const UNFOLLOWABLE_NOTICE: Record<UnfollowableReason, string> = {
  auction: "Draft Mode can't follow an auction draft.",
  'no-team': "Couldn't find your team in this Yahoo league.",
  'too-few-teams': "Couldn't find the teams in this Yahoo league.",
};

@Component({
  selector: 'app-draft-mode',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    DraftSetupComponent,
    DraftRosterPanelComponent,
    DraftAvailablePanelComponent,
    DraftPicksPanelComponent,
    DraftSummaryComponent,
    IconComponent,
    TooltipDirective,
  ],
  providers: [DraftPlayerLookupService],
  templateUrl: './draft-mode.html',
  styleUrl: './draft-mode.css',
})
export class DraftModeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly playerService = inject(PlayerService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly snake = inject(DraftSnakeService);
  private readonly rosterService = inject(DraftRosterService);
  private readonly tierService = inject(TierService);
  private readonly statInfoService = inject(StatInfoService);
  readonly lookup = inject(DraftPlayerLookupService);
  private readonly features = inject(FeatureService);
  private readonly yahoo = inject(YahooService);

  /** The saved draft this page is on, or null while one is still being set up. */
  readonly draftId = signal<string | null>(null);
  readonly draftName = signal<string>('');
  /**
   * The preset a draft is being set up against before anything is saved for it. Set only on
   * `/draft/new/preset/:preset`, where there is no row yet: it is created once the setup is
   * confirmed, so someone who backs out of the setup leaves nothing behind.
   */
  private readonly unsavedPreset = signal<Preset | null>(null);
  /**
   * Whether the name on screen is one the user typed rather than the one this page proposed.
   * A name they chose is sent as it stands; the proposal is only a proposal, and the server has
   * the last word on it.
   */
  private readonly nameIsTheirs = signal<boolean>(false);
  /**
   * The board a draft is being set up against, on `/draft/new/board/:board`. The same story as
   * the preset: nothing is saved until the setup is confirmed, and then the server copies that
   * board into a draft of its own — so the board is untouched however many drafts are started
   * against it.
   */
  private readonly unsavedBoard = signal<string | null>(null);
  /**
   * A league name a sync produced while there was still no row to rename. The draft takes it
   * once it is created, through the same derived rename an established draft gets.
   */
  private readonly pendingLeagueName = signal<string | null>(null);

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  readonly isRenaming = signal<boolean>(false);
  readonly renameValue = signal<string>('');
  readonly renameSaving = signal<boolean>(false);
  readonly renameError = signal<string | null>(null);
  readonly loaded = signal<boolean>(false);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly searchTerm = signal<string>('');
  readonly selectedPositions = signal<readonly PositionFilter[]>(['ALL']);
  readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);
  readonly showStats = signal<boolean>(true);
  readonly pageSizeOptions: { label: string; value: number }[] = [
    { label: '50', value: 50 },
    { label: '100', value: 100 },
    { label: '200', value: 200 },
    { label: '300', value: 300 },
    { label: 'All', value: Infinity },
  ];
  readonly positionFilters: { value: PositionFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'C', label: 'C' },
    { value: 'LW', label: 'LW' },
    { value: 'RW', label: 'RW' },
    { value: 'D', label: 'D' },
    { value: 'G', label: 'G' },
  ];

  readonly draft = signal<DraftState | null>(null);
  readonly setupOpen = signal<boolean>(false);
  readonly editingPick = signal<number | null>(null);
  readonly pendingRemoval = signal<number | null>(null);
  readonly showSummary = signal<boolean>(false);
  readonly confirmingFinish = signal<boolean>(false);

  /** Whether the board is following the linked Yahoo league's draft, which locks every pick edit. */
  readonly following = signal<boolean>(false);
  readonly followLoading = signal<boolean>(false);
  /** What stopped or is holding up following, shown beside the control. */
  readonly followNotice = signal<string | null>(null);
  /** A league draft waiting for the user to agree to replace the picks entered by hand. */
  readonly pendingFollow = signal<LeagueDraftResponse | null>(null);
  private followSubscription: Subscription | null = null;

  private readonly data = signal<ProjectionData | null>(null);
  /**
   * The league this draft is ranked by. The draft's own once it has one; before that, the one set
   * on the draft picker, or else the projection's. Every change made here lands in this and is
   * saved with the draft, never in the projection's settings.
   */
  private readonly league = signal<DraftSettings | null>(null);
  private readonly allPlayers = signal<Player[]>([]);

  readonly playerMap = computed(
    () => new Map(this.allPlayers().map((player) => [player.id, player])),
  );

  private readonly projections = computed<Projection[]>(() => {
    const data = this.data();
    return data ? this.serializer.fromProjectionData(data).playerProjections : [];
  });

  readonly scoringType = computed(() => this.league()?.scoringType ?? 'points');
  readonly statColumns = computed<ScoringStatKey[]>(
    () => (this.league()?.activeScoringColumns ?? []) as ScoringStatKey[],
  );
  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Total Points' : 'Z-Score',
  );
  private readonly statWeights = computed<StatWeights | null>(
    () => (this.league()?.statWeights as StatWeights | undefined) ?? null,
  );
  readonly rosterSlots = computed(() => this.league()?.rosterSlots ?? DEFAULT_ROSTER_SLOTS);
  readonly leagueSize = computed(() => this.league()?.leagueSize ?? DEFAULT_LEAGUE_SIZE);
  readonly yahooSync = computed(() => this.league()?.yahooSync ?? null);
  readonly espnSync = computed(() => this.league()?.espnSync ?? null);

  readonly teams = computed(() => this.draft()?.teams ?? []);
  readonly order = computed(() => this.draft()?.order ?? []);
  readonly picks = computed(() => this.draft()?.picks ?? []);

  readonly phase = computed<'setup' | 'draft'>(() =>
    !this.snake.isValidDraft(this.draft()) || this.setupOpen() ? 'setup' : 'draft',
  );

  private readonly teamById = computed(() => new Map(this.teams().map((team) => [team.id, team])));
  private readonly myTeamId = computed(() => this.teams().find((team) => team.mine)?.id ?? null);

  private readonly draftedIds = computed(() => new Set(this.picks().map((pick) => pick.playerId)));
  private readonly myPicks = computed(() => {
    const teamId = this.myTeamId();
    return teamId === null ? [] : this.snake.picksForTeam(this.picks(), teamId);
  });

  private readonly rankingInput = computed<RankingInput | null>(() => {
    const data = this.data();
    const league = this.league();
    if (!data || !league) {
      return null;
    }
    // How the numbers are rounded is the projection's; how they are scored is the draft's.
    const settings = data.settings;
    return {
      projections: this.projections(),
      scoringType: league.scoringType,
      statWeights: league.statWeights as StatWeights,
      activeScoringColumns: new Set(league.activeScoringColumns as ScoringStatKey[]),
      leagueSize: league.leagueSize ?? DEFAULT_LEAGUE_SIZE,
      rosterSlots: league.rosterSlots,
      minGoalieGames: league.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES,
      // The order is the projection's, not the draft's league: a board drafted against a
      // projection has to be the board the owner arranged, or the best available is a different
      // player here than on the page it was started from.
      manualRanking: this.serializer.manualRankingFrom(settings.manualRanking),
      // As the editor reads them: a board of the model's fractional lines is ranked here the way
      // it was ranked there, rather than on numbers rounded to whole ones on the way in.
      decimalSettings: readableDecimalSettings(
        this.projections(),
        settings.decimalSettings as Record<DecimalStatKey, number>,
        settings.useDefaultDecimals ?? true,
      ),
    };
  });

  private readonly ranked = computed<ScoredProjection[]>(() => {
    const input = this.rankingInput();
    return input ? this.ranking.rankOverall(input) : [];
  });

  private readonly contributionsByPlayerId = computed<Map<number, Record<string, number>>>(() => {
    const input = this.rankingInput();
    return input
      ? this.ranking.contributionsByPlayerId(input)
      : new Map<number, Record<string, number>>();
  });

  /** The undrafted players under the chosen position chips, best first, before any search. */
  private readonly availableAtPositions = computed<ScoredProjection[]>(() => {
    const drafted = this.draftedIds();
    const filters = this.selectedPositions();
    const players = this.playerMap();
    return this.ranked().filter((scoredProjection) => {
      if (drafted.has(scoredProjection.projection.playerId)) {
        return false;
      }
      // Several positions can be picked at once, so a player shows if any of them fits.
      return filters.some((filter) =>
        this.positionFilterService.matches(scoredProjection.projection, players, filter),
      );
    });
  });

  /**
   * The number beside each available player: his place on the whole board, whoever has been
   * drafted and whatever the position chips or the search show. Porter Martone is 157 from the
   * first pick to the last, so the gaps in the list are the players already gone. It used to be
   * his place in the list on screen, which put him 1st when searched for and moved him up a place
   * with every pick made above him.
   */
  readonly boardRanks = computed<ReadonlyMap<number, number>>(
    () => new Map(this.ranked().map((sp, index) => [sp.projection.playerId, index + 1])),
  );

  readonly available = computed<ScoredProjection[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.availableAtPositions();
    }
    const players = this.playerMap();
    return this.availableAtPositions().filter((scoredProjection) =>
      players.get(scoredProjection.projection.playerId)?.name.toLowerCase().includes(term),
    );
  });

  readonly visibleCount = linkedSignal({
    source: () => ({
      term: this.searchTerm(),
      positions: this.selectedPositions(),
      pageSize: this.pageSize(),
    }),
    computation: () => this.pageSize(),
  });
  readonly visibleAvailable = computed(() => this.available().slice(0, this.visibleCount()));
  readonly hasMoreAvailable = computed(() => this.visibleCount() < this.available().length);

  /**
   * Tier lists per position, derived from the same ranking the board is ordered by. Empty while
   * the feature is off, which is what leaves every tier chip and the strip unrendered.
   */
  readonly tiers = computed<Map<TierPosition, PositionTiers>>(() => {
    if (!environment.tiersEnabled) {
      return new Map();
    }
    return this.tierService.tiersByPosition({
      ranked: this.ranked(),
      players: this.playerMap(),
      scoringType: this.scoringType(),
      leagueSize: this.leagueSize(),
      rosterSlots: this.rosterSlots(),
    });
  });

  /**
   * The one position a tier chip should speak for: whichever single position the filter narrows
   * to. With several picked, or none, a player's chip names his own strongest position instead.
   */
  private readonly filteredTierPosition = computed<TierPosition | null>(() => {
    const selected = this.selectedPositions();
    return selected.length === 1 ? this.tierService.tierPositionForFilter(selected[0]) : null;
  });

  readonly tierBadges = computed<Map<number, TierBadge>>(() => {
    const tiers = this.tiers();
    if (tiers.size === 0) {
      return new Map();
    }
    const position = this.filteredTierPosition();
    const badges = new Map<number, TierBadge>();
    for (const scoredProjection of this.visibleAvailable()) {
      const playerId = scoredProjection.projection.playerId;
      const badge = this.tierService.badgeFor(playerId, tiers, position);
      if (badge) {
        badges.set(playerId, badge);
      }
    }
    return badges;
  });

  /** Roster slot keys on the viewed team that are still open. */
  private readonly openSlotKeys = computed<Set<keyof RosterSlots>>(
    () =>
      new Set(
        this.roster()
          .slots.filter((slot) => slot.playerId === null)
          .map((slot) => slot.slotKey),
      ),
  );

  /**
   * Per position, the best tier still on the board and how many of it are left — the count a
   * manager is actually deciding on ("one defenseman left in this tier, six left wings in
   * theirs"). Positions the roster has no room for are marked so they can recede.
   */
  readonly tierStrip = computed<TierStripEntry[]>(() => {
    const tiers = this.tiers();
    if (tiers.size === 0) {
      return [];
    }
    const drafted = this.draftedIds();
    const players = this.playerMap();
    const openSlots = this.openSlotKeys();
    const ranked = this.ranked();
    const entries: TierStripEntry[] = [];

    for (const position of TIER_POSITIONS) {
      const tierByPlayerId = tiers.get(position)?.tierByPlayerId;
      if (!tierByPlayerId) {
        continue;
      }
      const stillAvailable = ranked.filter(
        (scoredProjection) =>
          !drafted.has(scoredProjection.projection.playerId) &&
          tierByPlayerId.has(scoredProjection.projection.playerId) &&
          this.positionFilterService.matches(scoredProjection.projection, players, position),
      );
      if (stillAvailable.length === 0) {
        continue;
      }
      // The list is ranked, so the first one left is in the best tier still available.
      const tier = tierByPlayerId.get(stillAvailable[0].projection.playerId)!;
      const remaining = stillAvailable.filter(
        (scoredProjection) => tierByPlayerId.get(scoredProjection.projection.playerId) === tier,
      ).length;
      entries.push({
        position,
        tier,
        remaining,
        needed: this.positionStillNeeded(position, openSlots),
      });
    }
    return entries;
  });

  /**
   * Whether a position can still go anywhere on the roster — its own slot, or a flex or bench slot
   * it is eligible for. A position with nowhere to go is not a decision, however thin its tier.
   */
  private positionStillNeeded(
    position: TierPosition,
    openSlots: ReadonlySet<keyof RosterSlots>,
  ): boolean {
    if (openSlots.has('bn')) {
      return true;
    }
    if (position === 'G') {
      return openSlots.has('g');
    }
    return openSlots.has(position.toLowerCase() as keyof RosterSlots) || openSlots.has('util');
  }

  private readonly scoreByPlayerId = computed(() => {
    const isPoints = this.scoringType() === 'points';
    return new Map(
      this.ranked().map((scoredProjection) => [
        scoredProjection.projection.playerId,
        isPoints ? scoredProjection.score.fantasyPoints : scoredProjection.score.zScore,
      ]),
    );
  });

  readonly leagueProjection = computed<LeagueProjectionData>(() => {
    const scores = this.scoreByPlayerId();
    const contributions = this.contributionsByPlayerId();
    const projectionById = new Map(
      this.ranked().map((scoredProjection) => [
        scoredProjection.projection.playerId,
        scoredProjection.projection,
      ]),
    );
    const players = new Map<number, LeagueProjectionPlayer>();
    const picksByTeam = new Map<string, number[]>();
    this.picks().forEach((pick) => {
      const list = picksByTeam.get(pick.teamId) ?? [];
      list.push(pick.playerId);
      picksByTeam.set(pick.teamId, list);
      const projection = projectionById.get(pick.playerId);
      if (projection && !players.has(pick.playerId)) {
        players.set(pick.playerId, {
          name: this.lookup.name(pick.playerId),
          score: scores.get(pick.playerId) ?? 0,
          projection,
          positions: this.lookup.positions(pick.playerId),
          contributions: contributions.get(pick.playerId) ?? {},
        });
      }
    });
    const teams: LeagueProjectionTeamInput[] = this.teams().map((team) => ({
      id: team.id,
      name: team.name,
      mine: team.mine,
      playerIds: picksByTeam.get(team.id) ?? [],
    }));
    return buildLeagueProjection(
      teams,
      players,
      this.statColumns(),
      this.rosterSlots(),
      this.scoringType(),
      this.statWeights(),
    );
  });

  readonly roster = computed(() =>
    this.rosterService.deriveRoster(this.myPicks(), this.playerMap(), this.rosterSlots()),
  );
  readonly filledCount = computed(
    () => this.roster().slots.filter((slot) => slot.playerId !== null).length,
  );
  readonly totalSlots = computed(() => this.roster().slots.length);

  readonly pickNumber = computed(() => this.picks().length + 1);
  readonly totalPicks = computed(() => this.teams().length * this.totalSlots());
  readonly isComplete = computed(
    () => this.totalPicks() > 0 && this.picks().length >= this.totalPicks(),
  );
  readonly currentSlot = computed(() =>
    this.isComplete() ? null : this.snake.slotForPick(this.pickNumber(), this.order()),
  );
  readonly upNextTeam = computed(() => {
    const slot = this.currentSlot();
    return slot ? (this.teamById().get(slot.teamId) ?? null) : null;
  });
  readonly isMyPick = computed(() => !!this.upNextTeam()?.mine);
  /**
   * Whether the board knows whose turn it is. Following a league whose draft has not started, it
   * does not: Yahoo names only the signed-in manager's own seat until it lists the draft's slots,
   * so the seats around it are this board's own order rather than the league's. The first pick
   * made is Yahoo's, and from there the order is the league's.
   */
  readonly awaitingLeagueDraft = computed(() => this.following() && this.picks().length === 0);
  /** The user's own seat, which a league does tell before its draft starts. */
  readonly myDraftPosition = computed(() => {
    const teamId = this.myTeamId();
    return teamId === null ? 0 : this.order().indexOf(teamId) + 1;
  });
  readonly canUndo = computed(() => this.picks().length > 0 && !this.following());
  readonly canFollow = computed(
    () => this.features.leagueDraftSync() && this.yahooSync() !== null && !this.finished(),
  );
  readonly finished = computed(() => !!this.draft()?.finishedAt);

  // A draft is a board of its own, holding a copy of whatever it was started against, so there
  // is no projection behind it to go back to — and the board it was copied from may since have
  // been edited or deleted. Leaving returns to the drafts.
  readonly exitLink = ['/draft'];

  readonly pickRounds = computed(() => {
    const teams = this.teamById();
    const teamCount = this.teams().length;
    if (teamCount === 0) {
      return [];
    }
    const rounds: {
      round: number;
      picks: { overall: number; teamName: string; mine: boolean; playerId: number }[];
    }[] = [];
    this.picks().forEach((pick, index) => {
      const overall = index + 1;
      const round = Math.ceil(overall / teamCount);
      const team = teams.get(pick.teamId);
      const entry = {
        overall,
        teamName: team?.name ?? '',
        mine: team?.mine ?? false,
        playerId: pick.playerId,
      };
      const current = rounds[rounds.length - 1];
      if (current && current.round === round) {
        current.picks.push(entry);
      } else {
        rounds.push({ round, picks: [entry] });
      }
    });
    rounds.reverse();
    rounds.forEach((group) => {
      group.picks.reverse();
    });
    return rounds;
  });

  readonly resultRounds = computed(() => {
    const teams = this.teamById();
    const teamCount = this.teams().length;
    if (teamCount === 0) {
      return [];
    }
    const rounds: {
      round: number;
      picks: {
        pickInRound: number;
        overall: number;
        playerId: number;
        teamName: string;
        mine: boolean;
      }[];
    }[] = [];
    this.picks().forEach((pick, index) => {
      const overall = index + 1;
      const round = Math.ceil(overall / teamCount);
      const pickInRound = overall - (round - 1) * teamCount;
      const team = teams.get(pick.teamId);
      const entry = {
        pickInRound,
        overall,
        playerId: pick.playerId,
        teamName: team?.name ?? '',
        mine: team?.mine ?? false,
      };
      const current = rounds[rounds.length - 1];
      if (current && current.round === round) {
        current.picks.push(entry);
      } else {
        rounds.push({ round, picks: [entry] });
      }
    });
    return rounds;
  });

  readonly resultTeams = computed(() => {
    const picksByTeam = new Map<string, { overall: number; playerId: number }[]>();
    this.picks().forEach((pick, index) => {
      const list = picksByTeam.get(pick.teamId) ?? [];
      list.push({ overall: index + 1, playerId: pick.playerId });
      picksByTeam.set(pick.teamId, list);
    });
    const teams = this.teamById();
    return this.order()
      .map((teamId) => teams.get(teamId))
      .filter((team) => team !== undefined)
      .map((team) => ({ team, picks: picksByTeam.get(team.id) ?? [] }));
  });

  readonly editingInfo = computed(() => {
    const overall = this.editingPick();
    if (overall === null) {
      return null;
    }
    const pick = this.picks()[overall - 1];
    if (!pick) {
      return null;
    }
    const team = this.teamById().get(pick.teamId);
    return { overall, teamName: team?.name ?? '', mine: team?.mine ?? false };
  });

  readonly removalPreview = computed(() => {
    const overall = this.pendingRemoval();
    if (overall === null) {
      return null;
    }
    const picks = this.picks();
    const target = picks[overall - 1];
    if (!target) {
      return null;
    }
    const order = this.order();
    const teams = this.teamById();
    const targetTeam = teams.get(target.teamId);
    const positions = Array.from(
      { length: picks.length - overall },
      (_, index) => overall + 1 + index,
    );
    const changes = positions.map((position) => {
      const oldSlot = this.snake.slotForPick(position, order);
      const newSlot = this.snake.slotForPick(position - 1, order);
      const oldTeam = oldSlot ? teams.get(oldSlot.teamId) : undefined;
      const newTeam = newSlot ? teams.get(newSlot.teamId) : undefined;
      return {
        playerId: picks[position - 1].playerId,
        oldOverall: position,
        newOverall: position - 1,
        oldTeamName: oldTeam?.name ?? '',
        newTeamName: newTeam?.name ?? '',
        teamChanged: oldSlot?.teamId !== newSlot?.teamId,
        affectsMine: !!oldTeam?.mine || !!newTeam?.mine,
      };
    });
    return {
      overall,
      playerId: target.playerId,
      teamName: targetTeam?.name ?? '',
      mine: targetTeam?.mine ?? false,
      changes,
    };
  });

  constructor() {
    // The heading is replaced by the input, so focus would otherwise be dropped on the body.
    effect(() => {
      if (this.isRenaming()) {
        this.renameInput()?.nativeElement.focus();
      }
    });
  }

  ngOnInit(): void {
    const presetId = this.route.snapshot.paramMap.get('preset');
    if (presetId !== null) {
      this.openUnsavedPresetDraft(presetId);
      return;
    }
    const boardId = this.route.snapshot.paramMap.get('board');
    if (boardId !== null) {
      this.openUnsavedBoardDraft(boardId);
      return;
    }
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/projections']);
      return;
    }
    forkJoin({
      projection: this.projectionStorage.loadProjection(id),
      players: this.playerService.getPlayers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ projection, players }) => {
          // Only a draft is opened here. A board's own address is the editor's, and a board
          // holds no draft of its own any more — an old link to one redirects to a fresh setup.
          if (projection.kind !== 'draft') {
            void this.router.navigate(['/draft/new/board', projection.id], { replaceUrl: true });
            return;
          }
          this.draftId.set(projection.id);
          this.draftName.set(projection.name);
          this.data.set(projection.data);
          // Corrected before anything sees the pool, so a pick lands in the slot this owner's
          // league says the player is eligible for rather than the one the read model reports.
          const pool = applyPositionOverrides(
            players,
            this.serializer.fromProjectionData(projection.data).positionOverrides,
          );
          this.allPlayers.set(pool);
          this.lookup.setPlayers(pool);
          const loadedDraft = this.serializer.fromProjectionData(projection.data).draft;
          this.draft.set(loadedDraft);
          // A draft saved before drafts held a league is ranked by the projection's, and takes a
          // copy of it with its next save.
          this.league.set(
            loadedDraft?.settings ??
              draftLeagueFromHistory() ??
              draftSettingsFromProjection(projection.data.settings),
          );
          // A finished draft opens straight to its summary — the board stays a click away
          // via "Edit draft", and editing picks doesn't un-finish it.
          if (loadedDraft?.finishedAt) {
            this.showSummary.set(true);
          }
          this.loaded.set(true);
        },
        error: () => {
          this.notification.error("Couldn't load the draft. Please try again.");
          void this.router.navigate(['/projections']);
        },
      });
  }

  /**
   * The setup for a preset draft, with nothing stored. The setup reads only the settings and the
   * player pool, and both are to hand without a board: the settings are the defaults a new board
   * would be created with, and the pool is everyone's. The rows a draft ranks by are the server's
   * to seed, and they arrive with the board once the setup is confirmed.
   */
  private openUnsavedPresetDraft(presetId: string): void {
    const preset = presetById(presetId);
    if (!preset) {
      void this.router.navigate(['/draft']);
      return;
    }
    this.unsavedPreset.set(preset);
    this.proposeName(preset.name);
    const defaults = this.serializer.toProjectionData(
      createDefaultProjectionState((key) => this.statInfoService.isRateStat(key)),
    );
    this.data.set(defaults);
    // The league set on the draft picker, if one was: the draft is created with it.
    this.league.set(draftLeagueFromHistory() ?? draftSettingsFromProjection(defaults.settings));
    this.playerService
      .getPlayers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (players) => {
          this.allPlayers.set(players);
          this.lookup.setPlayers(players);
          this.loaded.set(true);
        },
        error: () => {
          this.notification.error("Couldn't load the draft. Please try again.");
          void this.router.navigate(['/draft']);
        },
      });
  }

  /**
   * The setup for a draft against one of the user's boards, with nothing stored for it yet. The
   * board is read for its numbers and its settings; it is never written to, and the copy the
   * draft ranks by is made by the server once the setup is confirmed.
   */
  private openUnsavedBoardDraft(boardId: string): void {
    this.unsavedBoard.set(boardId);
    forkJoin({
      board: this.projectionStorage.loadProjection(boardId),
      players: this.playerService.getPlayers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ board, players }) => {
          if (board.kind === 'draft') {
            // A draft is not something to draft against; its own address is where it opens.
            void this.router.navigate(['/drafts', board.id], { replaceUrl: true });
            return;
          }
          this.proposeName(board.name);
          this.data.set(board.data);
          const pool = applyPositionOverrides(
            players,
            this.serializer.fromProjectionData(board.data).positionOverrides,
          );
          this.allPlayers.set(pool);
          this.lookup.setPlayers(pool);
          // The league set on the draft picker, if one was; otherwise the board's own.
          this.league.set(
            draftLeagueFromHistory() ?? draftSettingsFromProjection(board.data.settings),
          );
          this.loaded.set(true);
        },
        error: () => {
          this.notification.error("Couldn't open that board. Please try again.");
          void this.router.navigate(['/draft']);
        },
      });
  }

  /**
   * Names a draft that does not exist yet after whatever it is being played against, numbered
   * where the user already holds that name ("AI Projection (2)"). The server settles the real
   * name on create — it is the only place that can, under a race — but the heading has to say
   * now what the draft will be called, or it promises a name that is not the one that gets saved.
   *
   * <p>The drafts are read for this and nothing else, so a failure leaves the plain name rather
   * than holding up a setup nobody has saved anything for.
   */
  private proposeName(preferred: string): void {
    this.draftName.set(preferred);
    this.projectionStorage
      .listAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          if (this.nameIsTheirs() || this.draftId()) {
            return;
          }
          const drafts = rows.filter((row) => row.kind === 'draft').map((row) => row.name);
          this.draftName.set(freeNameFrom(preferred, drafts));
        },
      });
  }

  draftCurrent(playerId: number): void {
    const slot = this.currentSlot();
    if (this.following() || !slot || this.draftedIds().has(playerId)) {
      return;
    }
    this.mutate((draft) => ({
      ...draft,
      picks: [...draft.picks, { playerId, teamId: slot.teamId }],
    }));
  }

  undoLast(): void {
    if (this.following() || !this.picks().length) {
      return;
    }
    this.mutate((draft) => ({ ...draft, picks: draft.picks.slice(0, -1) }));
  }

  startEditPick(overall: number): void {
    if (this.following()) {
      return;
    }
    this.editingPick.set(overall);
  }

  cancelEditPick(): void {
    this.editingPick.set(null);
  }

  replacePick(playerId: number): void {
    const overall = this.editingPick();
    if (overall === null || this.draftedIds().has(playerId)) {
      return;
    }
    this.mutate((draft) => ({
      ...draft,
      picks: draft.picks.map((pick, index) =>
        index + 1 === overall ? { ...pick, playerId } : pick,
      ),
    }));
    this.editingPick.set(null);
  }

  removePick(overall: number): void {
    if (this.following() || overall < 1 || overall > this.picks().length) {
      return;
    }
    this.editingPick.set(null);
    this.mutate((draft) => {
      const remaining = draft.picks.filter((_, index) => index + 1 !== overall);
      return {
        ...draft,
        picks: remaining.map((pick, index) => {
          const slot = this.snake.slotForPick(index + 1, draft.order);
          return { playerId: pick.playerId, teamId: slot ? slot.teamId : pick.teamId };
        }),
      };
    });
  }

  requestRemovePick(overall: number): void {
    if (overall >= this.picks().length) {
      this.removePick(overall);
    } else {
      this.editingPick.set(null);
      this.pendingRemoval.set(overall);
    }
  }

  confirmRemovePick(): void {
    const overall = this.pendingRemoval();
    if (overall !== null) {
      this.removePick(overall);
    }
    this.pendingRemoval.set(null);
  }

  cancelRemovePick(): void {
    this.pendingRemoval.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmingFinish()) {
      this.cancelFinish();
    } else if (this.pendingRemoval() !== null) {
      this.cancelRemovePick();
    } else if (this.editingPick() !== null) {
      this.cancelEditPick();
    }
  }

  onSetupConfirmed(result: DraftSetupResult): void {
    this.league.update((league) =>
      league ? { ...league, rosterSlots: result.rosterSlots } : league,
    );
    this.analytics.capture('draft_started');
    const preset = this.unsavedPreset();
    if (preset) {
      this.createPresetDraft(preset, result.draft);
      return;
    }
    const board = this.unsavedBoard();
    if (board) {
      this.createBoardDraft(board, result.draft);
      return;
    }
    this.applySetup(result.draft);
  }

  /**
   * Saves the preset draft for the first time, with its setup already in it, and moves to the
   * board's own address. That address loads the board afresh, which is what brings in the rows
   * the server seeded; replacing the history entry keeps Back from reopening an unsaved setup
   * for a preset that now has a draft.
   */
  private createPresetDraft(preset: Preset, draft: DraftState): void {
    const data = this.data();
    if (!data || this.saveStatus() === 'saving') {
      return;
    }
    this.saveStatus.set('saving');
    // No player rows: `source` has the server fill them in. The name is the one on screen,
    // which is this page's proposal unless its owner typed over it; a clash is numbered by the
    // server, so what comes back is what it is called.
    this.projectionStorage
      .createProjection({
        name: this.draftName(),
        kind: 'draft',
        source: preset.source,
        data: { ...data, players: [], draft: this.withLeague(draft) },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => this.openCreatedDraft(projection),
        error: (error: unknown) => {
          this.saveStatus.set('idle');
          // The start page holds a locked preset back itself, so a refusal here most likely
          // means a subscription lapsed while the setup was open, and retrying cannot work.
          this.notification.error(
            isPremiumRefusal(error)
              ? PREMIUM_REFUSED_MESSAGE
              : "Couldn't start the draft. Please try again.",
          );
        },
      });
  }

  /**
   * Saves a draft against one of the user's boards for the first time, with its setup already in
   * it, and moves to its own address. The player rows are not sent: the server copies the board's
   * — half a megabyte that never leaves it — which is also what makes the copy the draft ranks by
   * independent of the board from that moment on.
   *
   * <p>The name is the server's to settle: it takes the board's, numbered where another draft of
   * this user's already holds it, so the tenth draft off one projection names itself.
   */
  private createBoardDraft(boardId: string, draft: DraftState): void {
    const data = this.data();
    if (!data || this.saveStatus() === 'saving') {
      return;
    }
    this.saveStatus.set('saving');
    this.projectionStorage
      .startDraft(
        boardId,
        { settings: data.settings, players: [], draft: this.withLeague(draft) },
        this.draftName(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => this.openCreatedDraft(created),
        error: () => {
          this.saveStatus.set('idle');
          this.notification.error("Couldn't start the draft. Please try again.");
        },
      });
  }

  /**
   * Moves to the draft's own address once it exists. That address loads it afresh, which is what
   * brings in the rows the server copied or seeded; replacing the history entry keeps Back from
   * reopening a setup for a draft that has already been created. A league synced during that
   * setup names the draft here, where there is at last a row to rename.
   */
  private openCreatedDraft(created: ProjectionResponse): void {
    const league = this.pendingLeagueName();
    this.pendingLeagueName.set(null);
    if (league) {
      this.projectionStorage
        .renameProjection(created.id, league, true)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          error: () => this.notification.error("Couldn't name the draft after the league."),
        });
    }
    void this.router.navigate(['/drafts', created.id], { replaceUrl: true });
  }

  applyEspnSync(result: EspnSyncResult): void {
    this.nameAfterLeague(result.leagueName);
    this.applyImportedLeague(result.settings, {
      espnSync: {
        // ESPN names the league in its settings response; the user only ever typed the id.
        leagueName: result.leagueName ?? result.leagueId,
        leagueId: result.leagueId,
        syncedAt: new Date().toISOString(),
      },
      lastEspnLeagueId: result.leagueId,
      // These settings are ESPN's now, so a Yahoo stamp would mislabel them.
      yahooSync: undefined,
    });
  }

  applyYahooSync(result: YahooSyncResult): void {
    this.nameAfterLeague(result.leagueName);
    this.applyImportedLeague(result.settings, {
      yahooSync: {
        leagueName: result.leagueName,
        leagueKey: result.leagueKey,
        syncedAt: new Date().toISOString(),
      },
      espnSync: undefined,
    });
  }

  /**
   * An import, into the draft's league. Saved at once if the draft already exists; during the
   * setup of a new one it is held until the setup is confirmed, like the rest of the setup.
   */
  private applyImportedLeague(
    mapped: LeagueProjectionSettingsResponse,
    stamps: Partial<DraftSettings>,
  ): void {
    this.league.update((league) =>
      league
        ? {
            ...league,
            scoringType: mapped.scoringType,
            activeScoringColumns: [...mapped.activeScoringColumns],
            activeUtilityColumns: [...mapped.activeUtilityColumns],
            rosterSlots: mapped.rosterSlots,
            ...(mapped.leagueSize != null ? { leagueSize: mapped.leagueSize } : {}),
            ...(mapped.statWeights ? { statWeights: mapped.statWeights } : {}),
            ...stamps,
          }
        : league,
    );
    if (this.draft()) {
      this.save();
    }
  }

  /**
   * A synced league names the draft after itself. Only a draft still carrying the name the
   * server gave it: the rename is sent as derived, and the server declines it once the owner has
   * named the draft themselves — a name somebody chose is more deliberate than the default it
   * would replace. A clash with another draft is numbered rather than refused, for the same
   * reason: nobody typed this name either.
   *
   * <p>During the setup of a draft that does not exist yet there is nothing to rename, so the
   * name is held until the row is created.
   */
  private nameAfterLeague(leagueName: string | null | undefined): void {
    const name = leagueName?.trim();
    if (!name) {
      return;
    }
    const id = this.draftId();
    if (!id) {
      this.pendingLeagueName.set(name);
      return;
    }
    this.projectionStorage
      .renameProjection(id, name, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (renamed) => this.draftName.set(renamed.name),
        error: () => this.notification.error("Couldn't name the draft after the league."),
      });
  }

  startRename(): void {
    this.renameValue.set(this.draftName());
    this.renameError.set(null);
    this.isRenaming.set(true);
  }

  cancelRename(): void {
    this.isRenaming.set(false);
    this.renameError.set(null);
  }

  onRenameInput(event: Event): void {
    this.renameValue.set((event.target as HTMLInputElement).value);
  }

  /**
   * Names the draft. Unlike the name a sync derives, this one is refused where another draft
   * holds it: it is the whole of what was asked for, so it is said rather than worked around.
   * From here on a league sync leaves the name alone.
   */
  saveRename(): void {
    const name = this.renameValue().trim();
    const id = this.draftId();
    if (this.renameSaving()) {
      return;
    }
    if (!name) {
      this.renameError.set('Name cannot be empty.');
      return;
    }
    if (name === this.draftName()) {
      this.cancelRename();
      return;
    }
    // A draft still being set up has nothing to rename: the name is held here and goes with the
    // draft when its setup is confirmed. Nothing can clash yet, and nothing needs saving.
    if (!id) {
      this.draftName.set(name);
      this.nameIsTheirs.set(true);
      this.isRenaming.set(false);
      return;
    }
    this.renameSaving.set(true);
    this.renameError.set(null);
    this.projectionStorage
      .renameProjection(id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (renamed) => {
          this.draftName.set(renamed.name);
          this.nameIsTheirs.set(true);
          this.renameSaving.set(false);
          this.isRenaming.set(false);
        },
        error: (error: unknown) => {
          this.renameSaving.set(false);
          const conflict = error instanceof HttpErrorResponse && error.status === 409;
          this.renameError.set(
            conflict ? 'You already have a draft with that name.' : "Couldn't rename the draft.",
          );
        },
      });
  }

  /** A draft as it is saved: with the league it is ranked by. */
  private withLeague(draft: DraftState): DraftState {
    const league = this.league();
    return league ? { ...draft, settings: league } : draft;
  }

  applySetup(next: DraftState): void {
    this.draft.set(next);
    this.setupOpen.set(false);
    this.editingPick.set(null);
    this.showSummary.set(false);
    this.save();
  }

  cancelSetup(): void {
    if (this.snake.isValidDraft(this.draft())) {
      this.setupOpen.set(false);
    }
  }

  editTeams(): void {
    if (this.following()) {
      return;
    }
    this.editingPick.set(null);
    this.setupOpen.set(true);
  }

  /**
   * Starts following the linked Yahoo league's draft. The league becomes the source of the board:
   * its teams, its order and its picks. Asks first when that would replace picks entered by hand.
   */
  requestFollow(): void {
    const leagueKey = this.yahooSync()?.leagueKey;
    if (!leagueKey || this.following() || this.followLoading()) {
      return;
    }
    this.followNotice.set(null);
    this.followLoading.set(true);
    this.yahoo
      .leagueDraft(leagueKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (league) => {
          this.followLoading.set(false);
          const reason = unfollowableReason(league);
          if (reason) {
            this.followNotice.set(UNFOLLOWABLE_NOTICE[reason]);
            return;
          }
          if (isLeagueBoard(this.draft(), league)) {
            this.startFollowing(leagueKey, league);
          } else {
            this.pendingFollow.set(league);
          }
        },
        error: (error: unknown) => {
          this.followLoading.set(false);
          this.followNotice.set(this.followErrorNotice(error));
        },
      });
  }

  confirmFollow(): void {
    const league = this.pendingFollow();
    const leagueKey = this.yahooSync()?.leagueKey;
    this.pendingFollow.set(null);
    if (league && leagueKey) {
      this.startFollowing(leagueKey, league);
    }
  }

  cancelFollow(): void {
    this.pendingFollow.set(null);
  }

  stopFollowing(): void {
    this.followSubscription?.unsubscribe();
    this.followSubscription = null;
    this.following.set(false);
  }

  private startFollowing(leagueKey: string, league: LeagueDraftResponse): void {
    this.following.set(true);
    this.editingPick.set(null);
    this.pendingRemoval.set(null);
    this.setupOpen.set(false);
    this.analytics.capture('draft_follow_started');
    if (!this.applyLeagueDraft(league)) {
      return;
    }
    // A hidden tab skips its turn rather than queueing one, and a slow answer is never overtaken
    // by the next request.
    this.followSubscription = timer(FOLLOW_POLL_MS, FOLLOW_POLL_MS)
      .pipe(
        filter(() => typeof document === 'undefined' || !document.hidden),
        exhaustMap(() =>
          this.yahoo.leagueDraft(leagueKey).pipe(
            map((league) => ({ league, error: null })),
            catchError((error: unknown) => of({ league: null, error })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ league: next, error }) => {
        if (next) {
          this.applyLeagueDraft(next);
        } else {
          this.onFollowError(error);
        }
      });
  }

  /** Puts the league's board in place. False when following has stopped because of it. */
  private applyLeagueDraft(league: LeagueDraftResponse): boolean {
    const reason = unfollowableReason(league);
    if (reason) {
      this.followNotice.set(UNFOLLOWABLE_NOTICE[reason]);
      this.stopFollowing();
      return false;
    }
    const next = boardFromLeagueDraft(this.draft(), league);
    if (!sameBoard(this.draft(), next)) {
      this.draft.set(next);
      this.save();
    }
    if (league.status === 'FINISHED') {
      this.followNotice.set('The Yahoo draft is finished.');
      this.stopFollowing();
      return false;
    }
    this.followNotice.set(null);
    return true;
  }

  /**
   * A dropped connection is worth another try, so polling carries on. A refusal, or a draft that is
   * no longer served, answers the same way next time, so following stops.
   */
  private onFollowError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 404 || status === 424) {
      this.followNotice.set(this.followErrorNotice(error));
      this.stopFollowing();
      return;
    }
    this.followNotice.set("Couldn't reach Yahoo. Trying again.");
  }

  private followErrorNotice(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 424) {
      return "Yahoo refused access to this league's draft.";
    }
    return "Couldn't load the Yahoo draft.";
  }

  requestFinishDraft(): void {
    // Always confirm — finishing marks the draft done and changes where it opens next time,
    // so it's worth an explicit "yes". The dialog's copy adapts to a full vs. early finish.
    this.confirmingFinish.set(true);
  }

  cancelFinish(): void {
    this.confirmingFinish.set(false);
  }

  finishDraft(): void {
    this.confirmingFinish.set(false);
    this.persistDraft((draft) => ({ ...draft, finishedAt: new Date().toISOString() }));
    this.showSummary.set(true);
  }

  viewSummary(): void {
    this.showSummary.set(true);
  }

  backToDraft(): void {
    this.showSummary.set(false);
  }

  togglePositionFilter(filter: PositionFilter): void {
    if (filter === 'ALL') {
      this.selectedPositions.set(['ALL']);
      return;
    }
    const chosen = this.selectedPositions().filter((position) => position !== 'ALL');
    const next = chosen.includes(filter)
      ? chosen.filter((position) => position !== filter)
      : [...chosen, filter];
    this.selectedPositions.set(next.length ? next : ['ALL']);
  }

  showMore(): void {
    this.visibleCount.update((count) => count + this.pageSize());
  }

  private mutate(fn: (draft: DraftState) => DraftState): void {
    // Any edit to the picks reopens a finished draft — it's in progress again until the
    // manager finishes it anew (even a swap that leaves every slot filled). Finishing sets
    // finishedAt via persistDraft, outside this path; merely opening the board to look
    // doesn't touch the picks, so it stays finished.
    this.persistDraft((draft) => {
      const next = fn(draft);
      return next.finishedAt ? { ...next, finishedAt: undefined } : next;
    });
  }

  private persistDraft(fn: (draft: DraftState) => DraftState): void {
    this.draft.update((draft) => (draft ? fn(draft) : draft));
    this.save();
  }

  private save(): void {
    const id = this.draftId();
    const data = this.data();
    if (!id || !data) {
      return;
    }
    // Draft mode only ever moves picks around, so the player rows are left out entirely and
    // the server keeps the stored ones. They are ~0.5 MB, and re-uploading them on every pick
    // made saving depend on an upload that fails outright on a slow connection.
    // The projection's settings go back exactly as they were loaded: the draft's league is saved
    // with the draft, so nothing done here changes the projection it is played against.
    const draft = this.draft();
    const updated: UpdateProjectionData = {
      settings: data.settings,
      draft: draft ? this.withLeague(draft) : undefined,
    };
    this.saveStatus.set('saving');
    this.projectionStorage
      .updateProjection(id, { name: this.draftName(), data: updated })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saveStatus.set('saved'),
        error: () => this.saveStatus.set('error'),
      });
  }
}
