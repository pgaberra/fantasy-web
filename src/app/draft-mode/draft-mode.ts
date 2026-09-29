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
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  catchError,
  EMPTY,
  exhaustMap,
  filter,
  forkJoin,
  fromEvent,
  map,
  Observable,
  of,
  startWith,
  Subscription,
  switchMap,
  timer,
} from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { freeNameFrom } from '../services/projection-name';
import { NotificationService } from '../services/notification.service';
import { isNotFound } from '../shared/http-error';
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
import { EspnService } from '../services/espn.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
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
import { draftSettingsFromProjection } from '../shared/league-settings/league-settings';
import { Preset, presetById } from '../models/preset';
import { isPremiumRefusal, PREMIUM_REFUSED_MESSAGE } from '../shared/premium/premium-refused';
import {
  createDefaultProjectionState,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
} from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { DraftRosterService } from './draft-roster.service';
import { DraftSnakeService } from './draft-snake.service';
import { draftRankingInput } from './draft-ranking';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup/draft-setup';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { DraftRosterPanelComponent } from './draft-roster-panel/draft-roster-panel';
import { DraftAvailablePanelComponent } from './draft-available-panel/draft-available-panel';
import { DraftPicksPanelComponent } from './draft-picks-panel/draft-picks-panel';
import { SyncWarningDialogComponent } from '../draft-projection/sync-warning-dialog/sync-warning-dialog';
import { IconComponent } from '../shared/icon/icon';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import {
  DraftFollowConnectComponent,
  CookieRepair,
} from './draft-follow-connect/draft-follow-connect';
import {
  boardFromLeagueDraft,
  DraftSyncCheck,
  FollowedLeague,
  hasLeagueTeams,
  isLeagueBoard,
  sameBoard,
  seatIsGuess,
  isLeagueDraft,
  UnfollowableReason,
  unfollowableReason,
} from './league-draft-follow';
import { CdkScrollable } from '@angular/cdk/scrolling';

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

/** Why a followed ESPN league needs the user's cookies. */
type CookieCause = 'no-team' | 'refused';

const COOKIE_REPAIR_REASON: Record<CookieCause, string> = {
  'no-team':
    "SlapStat couldn't tell which team in this ESPN league is yours. Add your ESPN cookies and " +
    'syncing picks starts again.',
  refused:
    "ESPN refused this league's draft: your ESPN cookies are missing or no longer valid. Paste " +
    'them again and syncing picks starts again.',
};

/** A 400 is ESPN's refusal to read the league with the cookies it was given, or without any. */
function refusal(error: unknown): CookieCause | null {
  return error instanceof HttpErrorResponse && error.status === 400 ? 'refused' : null;
}

function unfollowableNotice(
  reason: UnfollowableReason,
  platform: FollowedLeague['platform'],
): string {
  switch (reason) {
    case 'auction':
      return "Draft Mode can't follow an auction draft.";
    case 'no-team':
      return `Couldn't find your team in this ${platform} league.`;
    case 'too-few-teams':
      return `Couldn't find the teams in this ${platform} league.`;
  }
}

@Component({
  selector: 'app-draft-mode',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    DraftSetupComponent,
    DraftFollowConnectComponent,
    DraftRosterPanelComponent,
    DraftAvailablePanelComponent,
    DraftPicksPanelComponent,
    SyncWarningDialogComponent,
    IconComponent,
    TooltipDirective,
    // The settings popup scrolls inside itself, so a team dragged in it scrolls it along.
    CdkScrollable,
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
  private readonly espn = inject(EspnService);
  private readonly connectReturn = inject(YahooConnectReturnService);

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
  /** Whether this page is setting up a draft that does not exist yet. */
  private readonly isNewDraft = computed(
    () => this.unsavedPreset() !== null || this.unsavedBoard() !== null,
  );
  /**
   * Whether this new draft is left to its settings rather than made from its league's draft:
   * starting from the league failed, or the settings were confirmed with syncing switched off.
   */
  private readonly leagueStartFailed = signal<boolean>(false);
  private leagueStartInFlight = false;

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly setupDialog = viewChild<ElementRef<HTMLElement>>('setupDialog');
  private readonly setupComponent = viewChild(DraftSetupComponent);

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
  /**
   * A pick edit held back until the user agrees to it: on a board that is its league's draft,
   * changing a pick makes it the user's own board, and nothing brings the league's back.
   */
  readonly pendingSyncBreak = signal<(() => void) | null>(null);
  readonly confirmingFinish = signal<boolean>(false);

  /** Whether the board is following the linked league's draft, which locks every pick edit. */
  readonly following = signal<boolean>(false);
  readonly followLoading = signal<boolean>(false);
  /** What stopped or is holding up following, shown over the board. */
  readonly followNotice = signal<string | null>(null);
  /**
   * What the league in the settings answered when asked for its draft. The settings ask as soon
   * as syncing is switched on in them, before anything is saved, so the teams and the seat are
   * only ever locked to a league that has actually answered.
   */
  readonly setupCheck = signal<DraftSyncCheck>({ state: 'idle' });
  /** The league the settings last asked about, which is not the draft's until they are saved. */
  private setupCheckLeague: FollowedLeague | null = null;
  private setupCheckSubscription: Subscription | null = null;
  /** A league draft waiting for the user to agree to replace the picks entered by hand. */
  readonly pendingFollow = signal<LeagueDraftResponse | null>(null);
  /** Whether the board waiting to be replaced already has the league's teams, so only picks go. */
  readonly pendingFollowKeepsTeams = computed(() => {
    const league = this.pendingFollow();
    return !!league && hasLeagueTeams(this.draft(), league);
  });
  /**
   * A followed ESPN league that stopped for want of the user's cookies, so the dialog asking for
   * them opens: without the SWID no team in a league is the user's, and ESPN refuses a private league's
   * draft without both.
   */
  readonly cookieRepair = signal<CookieRepair | null>(null);
  /** Whether the board was saved following its league, so opening it picks the draft back up. */
  private readonly resumeFollowing = signal<boolean>(false);
  /**
   * Whether this page is the one a Yahoo connect left from. The connect starts in the settings'
   * league import, so the settings open again with the import in them.
   */
  readonly backFromYahoo = signal<boolean>(false);
  private followSubscription: Subscription | null = null;

  private readonly data = signal<ProjectionData | null>(null);
  /**
   * The league this draft is ranked by. The draft's own once it has one; before that, what it is
   * played against opens with. Set in the setup, where every change lands in this and is saved
   * with the draft, never in the projection's settings.
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

  /** Whether the board has teams and an order to draft on, which a draft not set up yet lacks. */
  readonly boardReady = computed(() => this.snake.isValidDraft(this.draft()));
  readonly phase = computed<'setup' | 'draft'>(() =>
    !this.boardReady() || this.setupOpen() || this.seatRequired() ? 'setup' : 'draft',
  );
  /** Whether the setup popup is over the board. */
  readonly setupShown = computed(() => this.phase() === 'setup');
  /**
   * Whether the setup can be closed onto the board. Not for a draft that has no board yet, nor for
   * one whose seat is a guess: no draft is played on a seat nobody chose, so the only way out of
   * those is off the page.
   */
  readonly setupDismissible = computed(() => this.boardReady() && !this.seatRequired());
  /**
   * Whether a new draft is being started from its league's own draft, which it is wherever it has
   * a league to follow: the league sets the teams and the order, so there is nothing to set up.
   * Waits for the features, which say whether the league can be followed here at all.
   */
  readonly startingFromLeague = computed(
    () =>
      this.isNewDraft() &&
      (!this.features.settled() || (this.followedLeague() !== null && !this.leagueStartFailed())),
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
    return data && league ? draftRankingInput(data, league, this.serializer) : null;
  });

  private readonly ranked = computed<ScoredProjection[]>(() => {
    const input = this.rankingInput();
    return input ? this.ranking.rankOverall(input) : [];
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

  readonly roster = computed(() =>
    this.rosterService.deriveRoster(this.myPicks(), this.playerMap(), this.rosterSlots()),
  );
  /**
   * Every player the user has drafted, placed or not — the count Yahoo shows. Counting filled slots
   * read 12/16 on a finished draft whose last four picks had no slot left to fill.
   */
  readonly draftedCount = computed(() => this.myPicks().length);
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
   * Whether the up-next line names the team on the clock. A board linked to a league but not
   * syncing it is drafted by hand, and its teams are only the league's as they were last read:
   * naming one says the league has it on the clock, which nothing here knows. It says the pick.
   */
  readonly namesUpNextTeam = computed(() => this.following() || this.followedLeague() === null);
  /**
   * Whether the board is waiting for the followed league's draft to make its first pick, when it
   * names no team up next: a league that has set its order says only the user's own seat in it,
   * and one that has not says nothing about who picks when. The first pick made is Yahoo's, and
   * from there the order is the league's. Also while the league is first asked, so a board opened
   * following never shows an up-next read off the league's team list.
   */
  readonly awaitingLeagueDraft = computed(
    () => (this.following() || this.followLoading()) && this.picks().length === 0,
  );
  /** The user's own seat in this board's order. */
  readonly myDraftPosition = computed(() => {
    const teamId = this.myTeamId();
    return teamId === null ? 0 : this.order().indexOf(teamId) + 1;
  });
  /** The followed league's last answer, which says whether its team order is its draft order. */
  private readonly lastLeagueDraft = signal<LeagueDraftResponse | null>(null);
  /** Whether the followed league's last answer said its team order is its draft order. */
  private readonly leagueOrderKnown = computed(
    () => this.following() && !!this.lastLeagueDraft()?.orderKnown,
  );
  /**
   * Whether the user's seat on this board is only where the league lists their team (see
   * `seatIsGuess`). Following, that is the league's business and nothing on screen reads it.
   */
  readonly seatUnknown = computed(() => seatIsGuess(this.draft(), this.lastLeagueDraft()));
  /**
   * Whether the board is to be drafted by hand on a seat nobody chose: sync switched off, or
   * stopped, before the league set its draft order. The setup asks for the seat first.
   */
  readonly seatRequired = computed(
    () => !this.following() && !this.followLoading() && this.seatUnknown(),
  );
  /**
   * The user's first pick in the followed league's draft, or null where the league has not set
   * its order: before a live draft runs Yahoo lists its teams in an order of its own, and a seat
   * read off that list is a guess.
   */
  readonly leagueFirstPick = computed(() => {
    const seat = this.myDraftPosition();
    return this.leagueOrderKnown() && seat > 0 ? seat : null;
  });
  readonly canUndo = computed(() => this.picks().length > 0 && !this.following());
  /**
   * The league the sync switch follows: the linked Yahoo league, or the linked ESPN one, where
   * this environment follows that platform's drafts. A board links one league at a time.
   */
  readonly followedLeague = computed<FollowedLeague | null>(() => {
    const yahoo = this.yahooSync();
    if (yahoo) {
      return this.features.leagueDraftSync()
        ? { platform: 'Yahoo', id: yahoo.leagueKey, name: yahoo.leagueName }
        : null;
    }
    const espn = this.espnSync();
    if (espn?.leagueId && this.features.espnLeagueDraftSync()) {
      return { platform: 'ESPN', id: espn.leagueId, name: espn.leagueName ?? espn.leagueId };
    }
    return null;
  });
  /** The platform named in what syncing has to say. */
  readonly followPlatform = computed(() => this.followedLeague()?.platform ?? 'Yahoo');
  readonly canFollow = computed(() => this.followedLeague() !== null && !this.finished());
  /**
   * Where a finished draft's power rankings open, which is where what the draft came to is shown:
   * on the draft itself, ranked by the projection it was played against. That holds for a draft
   * that followed a Yahoo league too — the league as it stands today, trades and pickups and all,
   * is one choice away in the same dropdown, but coming from the board means asking about the
   * board.
   */
  readonly rankingsParams = computed<{ draft: string } | null>(() => {
    const id = this.draftId();
    return this.finished() && id && this.features.leagueDraftSync() ? { draft: id } : null;
  });
  /**
   * The platforms whose drafts this environment follows, which is where the settings offer
   * syncing picks. None for a finished draft: there is nothing left to follow.
   */
  readonly syncPlatforms = computed<FollowedLeague['platform'][]>(() =>
    this.finished()
      ? []
      : [
          ...(this.features.leagueDraftSync() ? ['Yahoo' as const] : []),
          ...(this.features.espnLeagueDraftSync() ? ['ESPN' as const] : []),
        ],
  );
  /**
   * The dialog that asks for an ESPN league's cookies. Linking a league is the settings' import;
   * this is left for the one thing the import does not ask: the cookies a draft is read with.
   */
  readonly linkOpen = computed(() => this.cookieRepair() !== null);
  /** The draft's own league settings. */
  readonly leagueSettings = computed(() => this.league());
  readonly finished = computed(() => !!this.draft()?.finishedAt);
  /**
   * What the linked league last said its draft is, read while following it or asked once for a
   * board opened finished. Kept with the league it came from, so another league linked in the
   * settings is asked anew.
   */
  private readonly leagueDraftSeen = signal<{
    readonly leagueId: string;
    readonly draft: LeagueDraftResponse;
  } | null>(null);
  /** The league a finished board was last asked of, so one that does not answer is asked once. */
  private syncedFromAsked: string | null = null;
  /**
   * The league a finished board's picks came from, named beside its title. Read off what the
   * league answers rather than remembered: a finished board can be edited by hand, and one that
   * no longer is the league's draft must not say it is.
   */
  readonly syncedFrom = computed<FollowedLeague | null>(() => {
    const followed = this.followedLeague();
    const seen = this.leagueDraftSeen();
    return this.finished() &&
      followed !== null &&
      seen?.leagueId === followed.id &&
      isLeagueDraft(this.draft(), seen.draft)
      ? followed
      : null;
  });

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
    // The setup opens over the board, which it shuts to the keyboard, so focus goes into it.
    effect(() => {
      this.setupDialog()?.nativeElement.focus();
    });
    // A board left following picks the league's draft back up once following is offered here,
    // which waits on the features the BFF reports as well as on the board itself.
    effect(() => {
      if (this.resumeFollowing() && this.canFollow()) {
        untracked(() => {
          this.resumeFollowing.set(false);
          this.requestFollow();
        });
      }
    });
    // A board opened finished asks its league once whether these are the league's picks.
    effect(() => {
      const followed = this.followedLeague();
      if (
        this.loaded() &&
        this.finished() &&
        followed !== null &&
        this.leagueDraftSeen()?.leagueId !== followed.id
      ) {
        untracked(() => this.askWhereFinishedBoardCameFrom(followed));
      }
    });
    // A new draft with a league to follow is made from the league's own board, with no setup.
    effect(() => {
      if (
        this.isNewDraft() &&
        this.loaded() &&
        this.followedLeague() !== null &&
        !this.leagueStartFailed()
      ) {
        untracked(() => this.startFromLeague());
      }
    });
  }

  ngOnInit(): void {
    // Yahoo's consent is a full-page round trip, so whatever was open when it left is gone. Asked
    // once, here, so the settings it left from open again instead of the user starting over.
    this.backFromYahoo.set(this.connectReturn.returnedTo(this.router.url));
    this.setupOpen.set(this.backFromYahoo());
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
          this.resumeFollowing.set(!!loadedDraft?.following && !loadedDraft.finishedAt);
          // A draft saved before drafts held a league is ranked by the projection's, and takes a
          // copy of it with its next save.
          this.league.set(
            loadedDraft?.settings ?? draftSettingsFromProjection(projection.data.settings),
          );
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          if (isNotFound(error)) {
            this.notification.notice(
              "That draft isn't in this account. It may have been deleted, or belong to another account.",
            );
          } else {
            this.notification.error("Couldn't load the draft. Please try again.");
          }
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
    // What a new projection would be ranked by, until the setup says otherwise.
    this.league.set(draftSettingsFromProjection(defaults.settings));
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
          // The board's own league, until the setup says otherwise.
          this.league.set(draftSettingsFromProjection(board.data.settings));
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          if (isNotFound(error)) {
            this.notification.notice(
              "That projection isn't in this account. It may have been deleted, or belong to another account.",
            );
          } else {
            this.notification.error("Couldn't open that board. Please try again.");
          }
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
    this.unlessItBreaksSync(() =>
      this.mutate((draft) => ({ ...draft, picks: draft.picks.slice(0, -1) })),
    );
  }

  startEditPick(overall: number): void {
    if (this.following()) {
      return;
    }
    this.unlessItBreaksSync(() => this.editingPick.set(overall));
  }

  /**
   * Runs a pick edit, or asks first where the board is its league's draft (`syncedFrom`). Asked
   * before the edit, not after: there is no league draft to re-sync a finished board from, so
   * the edit is the thing to hold back.
   */
  private unlessItBreaksSync(edit: () => void): void {
    if (this.syncedFrom() === null) {
      edit();
    } else {
      this.pendingSyncBreak.set(edit);
    }
  }

  confirmSyncBreak(): void {
    const edit = this.pendingSyncBreak();
    this.pendingSyncBreak.set(null);
    edit?.();
  }

  cancelSyncBreak(): void {
    this.pendingSyncBreak.set(null);
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
    this.unlessItBreaksSync(() => {
      if (overall >= this.picks().length) {
        this.removePick(overall);
      } else {
        this.editingPick.set(null);
        this.pendingRemoval.set(overall);
      }
    });
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
    // The settings' own warning goes first, and the settings stay open behind it.
    const setup = this.setupComponent();
    if (setup?.syncWarning()) {
      setup.cancelSyncBreak();
      return;
    }
    if (this.pendingSyncBreak() !== null) {
      this.cancelSyncBreak();
    } else if (this.confirmingFinish()) {
      this.cancelFinish();
    } else if (this.pendingRemoval() !== null) {
      this.cancelRemovePick();
    } else if (this.editingPick() !== null) {
      this.cancelEditPick();
    } else if (!this.linkOpen() && this.pendingFollow() === null) {
      // The cookie and replace-picks dialogs open over the setup, and go before it.
      this.dismissSetup();
    }
  }

  onSetupConfirmed(result: DraftSetupResult): void {
    const linkedBefore = this.league()?.yahooSync?.leagueKey ?? this.league()?.espnSync?.leagueId;
    this.backFromYahoo.set(false);
    // A draft not saved yet is named in its setup, which covers the heading it is otherwise
    // renamed in. Held like a rename made there: it goes with the draft when it is created.
    if (result.name !== undefined && !this.draftId() && result.name !== this.draftName()) {
      this.draftName.set(result.name);
      this.nameIsTheirs.set(true);
    }
    // Said before the league is set: a new draft with a league to follow is otherwise made from
    // the league's board the moment it has one, which is what switching sync off declined.
    if (!result.follow) {
      this.leagueStartFailed.set(true);
    }
    this.league.set(result.league);
    const linked = result.league.yahooSync ?? result.league.espnSync;
    const linkedNow = result.league.yahooSync?.leagueKey ?? result.league.espnSync?.leagueId;
    if (this.draftId() && linkedNow && linkedNow !== linkedBefore) {
      this.nameAfterLeague(linked?.leagueName);
    }
    // Syncing picks: the league sets the teams and the order from here, so the board is made
    // from the league's draft rather than from the teams in the settings.
    if (result.follow && this.followedLeague() !== null) {
      this.setupOpen.set(false);
      if (this.draft()) {
        this.save();
      }
      if (!this.following()) {
        this.followLinkedLeague();
      }
      return;
    }
    if (this.following()) {
      this.stopFollowing();
    }
    this.analytics.capture('draft_started');
    if (this.isNewDraft()) {
      this.createDraft(result.draft);
      return;
    }
    this.applySetup(result.draft);
  }

  /**
   * Asks the league in the settings for its draft, to say whether it can be followed. Nothing is
   * saved and nothing follows yet: the answer is what the settings lock the teams and the seat
   * to, and a refusal leaves them to be set by hand.
   */
  checkSetupSync(league: FollowedLeague): void {
    this.setupCheckSubscription?.unsubscribe();
    this.setupCheckLeague = league;
    this.setupCheck.set({ state: 'checking' });
    this.setupCheckSubscription = this.leagueDraft(league)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (answer) => {
          const reason = unfollowableReason(answer);
          if (reason) {
            this.setupCheck.set({
              state: 'failed',
              notice: unfollowableNotice(reason, league.platform),
            });
            this.offerCookieRepair(league, reason === 'no-team' ? 'no-team' : null);
            return;
          }
          this.setupCheck.set({ state: 'ok', league: answer });
        },
        error: (error: unknown) => {
          this.setupCheck.set({
            state: 'failed',
            notice: this.followErrorNotice(error, league.platform),
          });
          this.offerCookieRepair(league, refusal(error));
        },
      });
  }

  /**
   * Makes a new draft from its league's own board, following it: the league's teams, its order
   * where it has set one, and any picks already made there. Where the league's draft cannot be
   * read or followed, the setup takes over with the reason on it.
   */
  private startFromLeague(): void {
    const followed = this.followedLeague();
    if (!followed || this.leagueStartInFlight) {
      return;
    }
    this.leagueStartInFlight = true;
    this.leagueStartFailed.set(false);
    this.followNotice.set(null);
    this.leagueDraft(followed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (league) => {
          const reason = unfollowableReason(league);
          if (reason) {
            this.failLeagueStart(unfollowableNotice(reason, followed.platform));
            this.offerCookieRepair(followed, reason === 'no-team' ? 'no-team' : null);
            return;
          }
          this.analytics.capture('draft_started');
          this.createDraft({ ...boardFromLeagueDraft(null, league), following: true });
        },
        error: (error: unknown) => {
          this.failLeagueStart(this.followErrorNotice(error, followed.platform));
          this.offerCookieRepair(followed, refusal(error));
        },
      });
  }

  /** Leaves a new draft to the setup, saying why where the league is the reason. */
  private failLeagueStart(notice: string | null): void {
    this.leagueStartInFlight = false;
    this.leagueStartFailed.set(true);
    if (notice !== null) {
      this.followNotice.set(notice);
      this.setupCheck.set({ state: 'failed', notice });
    }
  }

  /** Saves a new draft for the first time, against the preset or the board it was started from. */
  private createDraft(draft: DraftState): void {
    const preset = this.unsavedPreset();
    if (preset) {
      this.createPresetDraft(preset, draft);
      return;
    }
    const board = this.unsavedBoard();
    if (board) {
      this.createBoardDraft(board, draft);
    }
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
          this.failLeagueStart(null);
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
          this.failLeagueStart(null);
          this.notification.error("Couldn't start the draft. Please try again.");
        },
      });
  }

  /**
   * Moves to the draft's own address once it exists. That address loads it afresh, which is what
   * brings in the rows the server copied or seeded; replacing the history entry keeps Back from
   * reopening a setup for a draft that has already been created.
   */
  private openCreatedDraft(created: ProjectionResponse): void {
    void this.router.navigate(['/drafts', created.id], { replaceUrl: true });
  }

  /**
   * A synced league names the draft after itself. Only a draft still carrying the name the
   * server gave it: the rename is sent as derived, and the server declines it once the owner has
   * named the draft themselves — a name somebody chose is more deliberate than the default it
   * would replace. A clash with another draft is numbered rather than refused, for the same
   * reason: nobody typed this name either.
   *
   * <p>A draft that does not exist yet has no row to rename: it is named in its setup, which
   * proposes the league's name there.
   */
  private nameAfterLeague(leagueName: string | null | undefined): void {
    const name = leagueName?.trim();
    const id = this.draftId();
    if (!name || !id) {
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
    // The board is the user's from here: whatever the league last said about its order no longer
    // speaks for it, and a seat chosen in the setup is not a guess.
    this.lastLeagueDraft.set(null);
    this.draft.set(next);
    this.setupOpen.set(false);
    this.editingPick.set(null);
    this.save();
  }

  /**
   * The setup's Cancel: back to the board where there is one to play, and otherwise off the page,
   * which for a draft not saved yet leaves nothing behind.
   */
  cancelSetup(): void {
    this.backFromYahoo.set(false);
    if (this.setupDismissible()) {
      this.setupOpen.set(false);
    } else {
      void this.router.navigate(this.exitLink);
    }
  }

  /** A click beside the setup, or Escape: closes it where the board can be played without it. */
  dismissSetup(): void {
    if (this.setupShown() && this.setupDismissible()) {
      this.backFromYahoo.set(false);
      this.setupOpen.set(false);
    }
  }

  editTeams(): void {
    this.editingPick.set(null);
    // A board that is following has the league's answer already, so its settings open locked to
    // it; any other asks the league once syncing is switched on in them.
    const league = this.lastLeagueDraft();
    this.setupCheck.set(this.following() && league ? { state: 'ok', league } : { state: 'idle' });
    this.setupOpen.set(true);
  }

  /**
   * Starts following the linked league's draft. The league becomes the source of the board: its
   * teams, its order and its picks. Asks first when that would replace picks entered by hand.
   */
  requestFollow(): void {
    const followed = this.followedLeague();
    if (!followed || this.following() || this.followLoading()) {
      return;
    }
    this.followNotice.set(null);
    this.followLoading.set(true);
    this.leagueDraft(followed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (league) => {
          this.followLoading.set(false);
          const reason = unfollowableReason(league);
          if (reason) {
            this.failFollow(unfollowableNotice(reason, followed.platform));
            this.offerCookieRepair(followed, reason === 'no-team' ? 'no-team' : null);
            return;
          }
          if (isLeagueBoard(this.draft(), league)) {
            this.startFollowing(followed, league);
          } else {
            this.pendingFollow.set(league);
          }
        },
        error: (error: unknown) => {
          this.followLoading.set(false);
          this.failFollow(this.followErrorNotice(error, followed.platform));
          this.offerCookieRepair(followed, refusal(error));
        },
      });
  }

  /** Says why following did not start, on the board and in the settings that may open for it. */
  private failFollow(notice: string): void {
    this.followNotice.set(notice);
    this.setupCheck.set({ state: 'failed', notice });
  }

  /**
   * Asks the league for its draft, to say where a finished board's picks came from. A league
   * that does not answer leaves the board saying nothing, which is what it said before.
   */
  private askWhereFinishedBoardCameFrom(followed: FollowedLeague): void {
    if (this.syncedFromAsked === followed.id) {
      return;
    }
    this.syncedFromAsked = followed.id;
    this.leagueDraft(followed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draft) => this.leagueDraftSeen.set({ leagueId: followed.id, draft }),
        error: () => undefined,
      });
  }

  private leagueDraft(followed: FollowedLeague): Observable<LeagueDraftResponse> {
    return followed.platform === 'ESPN'
      ? this.espn.leagueDraft(followed.id)
      : this.yahoo.leagueDraft(followed.id);
  }

  /** Follows the linked league: a new draft is made from its board, a saved one switches over. */
  private followLinkedLeague(): void {
    if (this.isNewDraft()) {
      this.startFromLeague();
    } else {
      this.requestFollow();
    }
  }

  closeLink(): void {
    this.cookieRepair.set(null);
  }

  /**
   * ESPN took the cookies of the league that had stopped for want of them. The league and its
   * settings are the board's already, so nothing of them is touched: it is only asked again.
   */
  cookiesRepaired(): void {
    const leagueId = this.cookieRepair()?.leagueId;
    this.closeLink();
    // Asked for by the settings, the league is theirs to ask again: nothing follows until they
    // are saved.
    const asked = this.setupCheckLeague;
    if (this.setupShown() && asked && asked.id === leagueId) {
      this.checkSetupSync(asked);
    } else {
      this.followLinkedLeague();
    }
  }

  confirmFollow(): void {
    const league = this.pendingFollow();
    const followed = this.followedLeague();
    this.pendingFollow.set(null);
    if (league && followed) {
      this.startFollowing(followed, league);
    }
  }

  cancelFollow(): void {
    this.pendingFollow.set(null);
    this.rememberFollowing(false);
  }

  stopFollowing(): void {
    this.followSubscription?.unsubscribe();
    this.followSubscription = null;
    this.following.set(false);
    // A board whose seat is still the league's guess stays saved following until the setup has a
    // seat for it, so a reload picks the league's draft back up rather than open a board that would
    // be drafted on the guess.
    if (!this.seatUnknown()) {
      this.rememberFollowing(false);
    }
  }

  /**
   * Keeps the switch with the board (`draft.following`), so a reload, or the board opened on
   * another device, picks the league's draft back up. Saved only when it changes; leaving the page
   * is not switching it off, so nothing here runs on the way out.
   */
  private rememberFollowing(on: boolean): void {
    const draft = this.draft();
    if (!draft || !!draft.following === on) {
      return;
    }
    this.draft.set({ ...draft, following: on || undefined });
    this.save();
  }

  private startFollowing(followed: FollowedLeague, league: LeagueDraftResponse): void {
    this.following.set(true);
    this.editingPick.set(null);
    this.pendingRemoval.set(null);
    this.setupOpen.set(false);
    this.analytics.capture('draft_follow_started');
    if (!this.applyLeagueDraft(league, followed)) {
      return;
    }
    // A hidden tab skips its turn rather than queueing one, and a slow answer is never overtaken
    // by the next request. Coming back into view asks at once and starts the count again: the
    // user was most likely on the league's own tab, making picks this board has not seen.
    const shown =
      typeof document === 'undefined'
        ? EMPTY
        : fromEvent(document, 'visibilitychange').pipe(filter(() => !document.hidden));
    this.followSubscription = shown
      .pipe(
        map(() => 0),
        startWith(FOLLOW_POLL_MS),
        switchMap((firstIn) => timer(firstIn, FOLLOW_POLL_MS)),
        filter(() => typeof document === 'undefined' || !document.hidden),
        exhaustMap(() =>
          this.leagueDraft(followed).pipe(
            map((league) => ({ league, error: null })),
            catchError((error: unknown) => of({ league: null, error })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ league: next, error }) => {
        if (next) {
          this.applyLeagueDraft(next, followed);
        } else {
          this.onFollowError(error, followed);
        }
      });
  }

  /** Whether every team has made a pick for every roster slot — the count `isComplete` reads. */
  private fillsEverySlot(board: DraftState): boolean {
    const totalPicks = board.teams.length * this.totalSlots();
    return totalPicks > 0 && board.picks.length >= totalPicks;
  }

  /** Puts the league's board in place. False when following has stopped because of it. */
  private applyLeagueDraft(league: LeagueDraftResponse, followed: FollowedLeague): boolean {
    const reason = unfollowableReason(league);
    if (reason) {
      this.followNotice.set(unfollowableNotice(reason, followed.platform));
      this.stopFollowing();
      this.offerCookieRepair(followed, reason === 'no-team' ? 'no-team' : null);
      return false;
    }
    this.lastLeagueDraft.set(league);
    this.leagueDraftSeen.set({ leagueId: followed.id, draft: league });
    // A draft the league has finished is brought over whole and finishes the board with it: nothing is
    // left to follow, and a board still open beside a switch that turned itself off read as a
    // sync that refused to start.
    //
    // So does its last pick. Yahoo reports the draft over (`postdraft`) half a minute to a minute
    // after that pick lands, and until then the board read "Draft complete" with no way on: no
    // power rankings, and no Finish draft while following.
    const current = this.draft();
    const leagueBoard = boardFromLeagueDraft(current, league);
    const leagueFinished = league.status === 'FINISHED' || this.fillsEverySlot(leagueBoard);
    // The switch is saved with the board it put in place, in the same save.
    const board = {
      ...leagueBoard,
      following: !leagueFinished || undefined,
    };
    const next =
      leagueFinished && !current?.finishedAt
        ? { ...board, finishedAt: new Date().toISOString() }
        : board;
    if (
      !sameBoard(current, next) ||
      next.finishedAt !== current?.finishedAt ||
      !!next.following !== !!current?.following
    ) {
      this.draft.set(next);
      this.save();
    }
    this.followNotice.set(null);
    if (leagueFinished) {
      this.stopFollowing();
      return false;
    }
    return true;
  }

  /**
   * A dropped connection is worth another try, so polling carries on. A refusal, or a draft that is
   * no longer served, answers the same way next time, so following stops. ESPN's refusal is a 400:
   * its private league read without the user's cookies, or with cookies ESPN no longer takes.
   */
  private onFollowError(error: unknown, followed: FollowedLeague): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 400 || status === 404 || status === 424) {
      this.followNotice.set(this.followErrorNotice(error, followed.platform));
      this.stopFollowing();
      this.offerCookieRepair(followed, refusal(error));
      return;
    }
    this.followNotice.set('Sync unavailable at the moment.');
  }

  /**
   * Asks for the ESPN league's cookies when they are what stopped it: a league with
   * no team found as the user's (no SWID to tell), or a draft ESPN refused (a private league's,
   * without cookies or with ones ESPN no longer takes). Yahoo's causes have no such cure here.
   */
  private offerCookieRepair(followed: FollowedLeague, cause: CookieCause | null): void {
    if (followed.platform !== 'ESPN' || cause === null) {
      return;
    }
    this.cookieRepair.set({ leagueId: followed.id, reason: COOKIE_REPAIR_REASON[cause] });
  }

  private followErrorNotice(error: unknown, platform: FollowedLeague['platform']): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 424 || (platform === 'ESPN' && status === 400)) {
      return `${platform} refused access to this league's draft.`;
    }
    return `Couldn't load the ${platform} draft.`;
  }

  requestFinishDraft(): void {
    // A followed board finishes when the league's draft does. Finishing it by hand mid-draft
    // took the sync switch away while Yahoo's draft went on, so it is not offered then.
    if (this.following()) {
      return;
    }
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

  private persistDraft(fn: (draft: DraftState) => DraftState, onSaved?: () => void): void {
    this.draft.update((draft) => (draft ? fn(draft) : draft));
    this.save(onSaved);
  }

  private save(onSaved?: () => void): void {
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
        next: () => {
          this.saveStatus.set('saved');
          onSaved?.();
        },
        error: () => this.saveStatus.set('error'),
      });
  }
}
