import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { FeatureService } from '../services/feature.service';
import { LeagueChoiceService } from '../services/league-choice.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { LeagueProjectionTableComponent } from '../draft-mode/league-projection-table/league-projection-table';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { NoticeComponent } from '../shared/notice/notice';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { Platform, PlatformTabsComponent } from '../shared/platform-tabs/platform-tabs';
import {
  EspnLeagueSyncComponent,
  EspnSyncResult,
} from '../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { leagueProjectionFrom, scoreHeadingFor } from './power-rankings-data';
import { powerRankingsMessage, powerRankingsRetryable } from './power-rankings-error';
import { RankBy, rankByBoard } from './rank-by';

/**
 * How a league's teams stack up today: a Yahoo league, an ESPN league, or a draft made here.
 *
 * <p>Nothing is saved. The page is a read of a league that already exists somewhere else, so it
 * holds no board, no draft and no row of its own: leaving it and coming back reads the league
 * again. That is also why no players are ever posted — the league key, or a draft's id, is the
 * whole of what this page sends, and the BFF reads the rosters from Yahoo, or the picks from the
 * stored draft, itself.
 *
 * <p>The totals are everyone's; the players behind them are Premium's. Which is why the numbers
 * are computed on the server and this page only draws them.
 *
 * <p>The league is picked the way every other screen picks one — the shared
 * {@link YahooLeaguePicker} behind a dropdown — so that choosing a league means the same thing
 * here as in draft setup. The dropdown stays put once a league is read, because reading a second
 * league is the obvious next thing to do and it should not cost a trip back to a list.
 *
 * <p>The user's finished drafts are offered beside the Yahoo leagues, ranked from their picks by
 * the same rules as a league. A mock draft, or one played against an ESPN league, has its picks
 * nowhere but here; one that followed a Yahoo league sits beside that league, the draft as it was
 * made and the league as it stands today. A finished draft's board sends its reader here with the
 * draft named (`?draft=<id>`), and the page opens on the draft — never on its league, since the
 * reader came from the draft. A link that names a draft also ranks by the
 * projection that draft was played against, and so does picking a draft in the dropdown: that is
 * what the draft was made with, which the reader can still change.
 *
 * <p>An ESPN league is picked the way the league settings' import picks one (Alexander's call,
 * 2026-09-29): the same Yahoo / ESPN tabs, and under ESPN the same card — league id, "My league is
 * private", the espn_s2 and SWID cookies. ESPN lists no leagues for an account, so there is no
 * dropdown to fill; the card's button is the one button here, because a typed id is not read
 * until the reader says it is finished. The user's drafts stay under Yahoo, beside the leagues
 * they sat under before there was a choice.
 *
 * <p>What the league is ranked against is a second dropdown: the AI projection by default, last
 * season, or any board of the user's own or one they follow.
 *
 * <p>Neither dropdown has a button. Nothing here is saved or sent anywhere but to be read, so
 * there is nothing to confirm: what the two point at is what is on screen, and an account with
 * one league opens on its rankings.
 *
 * <p>The page opens on the league last chosen anywhere ({@link LeagueChoiceService}), on its own
 * platform's tab, and a league chosen here is the one the next page opens on. A link naming a
 * draft opens on the draft instead, and a draft picked here is not remembered: it is this page's
 * alone, a league no other page reads.
 */
@Component({
  selector: 'app-team-power-rankings',
  imports: [
    RouterLink,
    LeagueProjectionTableComponent,
    ErrorStateComponent,
    IconComponent,
    LoadingIndicatorComponent,
    NoticeComponent,
    PlatformTabsComponent,
    EspnLeagueSyncComponent,
  ],
  providers: [YahooLeaguePicker],
  templateUrl: './team-power-rankings.html',
  styleUrl: './team-power-rankings.css',
})
export class TeamPowerRankingsComponent implements OnInit {
  private readonly rankings = inject(LeagueSummaryService);
  private readonly features = inject(FeatureService);
  private readonly storage = inject(ProjectionStorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly choice = inject(LeagueChoiceService);

  /** The league picker every screen shares, so choosing a league means the same thing here. */
  readonly picker = inject(YahooLeaguePicker);

  protected readonly sharedNotice = environment.sharedNoticeEnabled;

  /** Whether ESPN leagues are offered at all: where the league settings' import offers them. */
  protected readonly espnOffered = environment.espnLeaguesEnabled;
  protected readonly platforms: readonly Platform[] = ['yahoo', 'espn'];

  /** Which platform's league is on screen. Yahoo, where the user's drafts also sit, until ESPN is chosen. */
  readonly platform = signal<Platform | 'none'>('yahoo');

  /** The ESPN league the card last read, which ESPN accepted with the cookies it was given. */
  readonly espnLeague = signal<{ id: string; name: string | null } | null>(null);

  /** The draft being read, where the dropdown points at one of the user's own drafts. */
  readonly draftId = signal<string | null>(null);

  /** The Yahoo league being read: whichever one the dropdown points at, where it is not a draft. */
  readonly leagueKey = computed(() => (this.draftId() ? null : this.picker.selectedKey()));

  readonly offered = computed(() => this.features.leagueDraftSync());

  /**
   * The draft a link named, whose projection is still to be looked up before anything is read —
   * reading at once would read by the default and then again by the draft's own.
   */
  private readonly linkedDraft = signal<string | null>(null);

  constructor() {
    effect(() => {
      const linked = this.linkedDraft();
      if (!linked || this.listResource.isLoading()) {
        return;
      }
      const draft = this.drafts().find((candidate) => candidate.id === linked);
      if (draft) {
        this.rankByDraftSource(draft);
      }
      this.linkedDraft.set(null);
    });
  }

  ngOnInit(): void {
    if (!this.offered()) {
      return;
    }
    const draft = this.route.snapshot.queryParamMap.get('draft');
    this.draftId.set(draft);
    this.linkedDraft.set(draft);
    this.picker.start(!draft);
    const espn = this.choice.on('ESPN');
    if (!draft && espn && this.espnOffered) {
      this.platform.set('espn');
      this.espnLeague.set({ id: espn.leagueId, name: espn.name });
    }
  }

  /** Whether this environment serves the AI projection, which is then what ranks by default. */
  readonly modelOffered = computed(() => this.features.aiProjection());

  /** Everything the user has: the boards a league is ranked against, and the drafts to rank. */
  private readonly listResource = rxResource({
    params: () => (this.offered() ? true : undefined),
    stream: () => this.storage.listAll(),
  });

  private readonly listed = computed<ProjectionSummaryResponse[]>(() =>
    this.listResource.hasValue() ? this.listResource.value() : [],
  );

  /** The boards a league can be ranked against: everything the editor opens, drafts left out. */
  private readonly boards = computed(() => this.listed().filter((row) => row.kind !== 'draft'));

  /** The user's finished drafts, each a league of its own to rank. */
  readonly drafts = computed(() =>
    this.listed().filter((row) => row.kind === 'draft' && row.draftStatus === 'finished'),
  );

  /** The user's own boards: made here, copied from a link, or uploaded from a spreadsheet. */
  readonly ownBoards = computed(() => this.boards().filter((board) => !board.origin));

  /** Boards followed through a share link, whose numbers are their author's. */
  readonly followedBoards = computed(() => this.boards().filter((board) => !!board.origin));

  readonly boardsFailed = computed(() => !!this.listResource.error());

  /**
   * Whether the list came back and holds no board of the user's own: the moment to say one can be
   * made. False while loading or failed, when nothing is known about what they have.
   */
  readonly ownBoardsEmpty = computed(
    () => this.listResource.hasValue() && !this.boardsFailed() && this.ownBoards().length === 0,
  );

  /** Whether there is anything to pick in the first dropdown: a Yahoo league or a draft. */
  readonly hasChoices = computed(
    () => this.picker.leagues().length > 0 || this.drafts().length > 0,
  );

  /** What the first dropdown points at: a Yahoo league's key, or a draft as `draft:<id>`. */
  readonly selectedValue = computed(() => {
    const draft = this.draftId();
    return draft ? `draft:${draft}` : (this.picker.selectedKey() ?? '');
  });

  readonly draftOption = (id: string): string => `draft:${id}`;

  /** What the reader picked in the second dropdown, if anything yet. */
  private readonly chosenRankBy = signal<RankBy | null>(null);

  /** What the league is ranked against: the reader's pick, else the model where it is served. */
  readonly rankBy = computed<RankBy>(
    () => this.chosenRankBy() ?? (this.modelOffered() ? 'model' : 'last_season'),
  );

  readonly boardOption = rankByBoard;

  /** What the table on screen was ranked against, in words, for the line above it. */
  readonly rankedByLabel = computed(() => {
    const data = this.rankingsData();
    if (!data) {
      return '';
    }
    if (data.source === 'projection') {
      const board = this.boards().find((candidate) => candidate.id === data.projectionId);
      return board ? board.name : 'your projection';
    }
    if (data.source === 'last_season') {
      return "last season's stats";
    }
    // Once the season is under way a team is ranked on what its players will do over the games
    // left, so the totals are that much smaller than a whole season's; the line says so.
    return data.inSeason
      ? 'the SlapStat AI projection for the rest of the season'
      : 'the SlapStat AI projection';
  });

  private readonly rankingsResource = rxResource({
    params: () => {
      if (this.linkedDraft()) {
        return undefined;
      }
      const rankBy = this.rankBy();
      if (this.platform() === 'espn') {
        const espn = this.espnLeague();
        return espn ? { kind: 'espn' as const, id: espn.id, rankBy } : undefined;
      }
      const draftId = this.draftId();
      if (draftId) {
        return { kind: 'draft' as const, id: draftId, rankBy };
      }
      const leagueKey = this.leagueKey();
      return leagueKey ? { kind: 'yahoo' as const, id: leagueKey, rankBy } : undefined;
    },
    stream: ({ params }) => {
      switch (params.kind) {
        case 'espn':
          return this.rankings.espnLeague(params.id, params.rankBy);
        case 'draft':
          return this.rankings.draft(params.id, params.rankBy);
        default:
          return this.rankings.yahooLeague(params.id, params.rankBy);
      }
    },
  });

  readonly loadingRankings = computed(() => this.rankingsResource.isLoading());
  readonly rankingsData = computed<LeagueSummaryResponse | null>(() =>
    this.rankingsResource.hasValue() ? this.rankingsResource.value() : null,
  );
  readonly rankingsError = computed(() => this.rankingsResource.error());

  /** Whether there are leagues or drafts to choose from and none chosen, which is worth saying. */
  readonly awaitingLeague = computed(
    () =>
      this.platform() !== 'espn' &&
      !this.picker.loadingLeagues() &&
      this.hasChoices() &&
      !this.leagueKey() &&
      !this.draftId(),
  );

  /** Whether there is something to rank, and so something to rank it by. */
  readonly offersRankBy = computed(
    () => this.platform() === 'espn' || !!this.picker.connected() || this.drafts().length > 0,
  );

  readonly leagueName = computed(() => {
    if (this.platform() === 'espn') {
      const espn = this.espnLeague();
      if (!espn) {
        return '';
      }
      return espn.name ?? espn.id;
    }
    const draftId = this.draftId();
    if (draftId) {
      return this.drafts().find((draft) => draft.id === draftId)?.name ?? '';
    }
    const key = this.leagueKey();
    return this.picker.leagues().find((league) => league.leagueKey === key)?.name ?? '';
  });

  readonly leagueProjection = computed(() => {
    const rankings = this.rankingsData();
    return rankings ? leagueProjectionFrom(rankings) : null;
  });

  readonly scoringType = computed(() =>
    this.rankingsData()?.scoringType === 'category' ? ('category' as const) : ('points' as const),
  );

  readonly scoreHeading = computed(() => {
    const rankings = this.rankingsData();
    return rankings ? scoreHeadingFor(rankings) : 'Total Points';
  });

  /** Whether the players behind each total came back, which is what Premium pays for. */
  readonly hasPlayers = computed(() => !!this.rankingsData()?.premium);

  /** Whether to sell Premium here at all: not in a build with no way to buy anything. */
  readonly sellsPremium = computed(() => environment.paymentsEnabled && !this.hasPlayers());

  /**
   * How many of the teams' players the chosen board has no line for, and so counts as nothing.
   * Only a board's gap is the reader's to know about; the model's pool is the whole league.
   */
  readonly unprojectedPlayers = computed(() => {
    const data = this.rankingsData();
    return data?.source === 'projection' ? data.unprojectedPlayers : 0;
  });

  /** A league nobody has drafted in yet has totals, but they are all nothing. */
  readonly notDrafted = computed(() => {
    const rankings = this.rankingsData();
    return !!rankings && rankings.picks === 0;
  });

  /**
   * What went wrong, in the reader's terms, and whether trying again could answer differently.
   * A refusal the server will repeat word for word gets no button.
   */
  readonly rankingsMessage = computed(() => {
    const error = this.rankingsError();
    return error ? powerRankingsMessage(error, this.platform()) : null;
  });

  readonly rankingsRetryable = computed(() => powerRankingsRetryable(this.rankingsError()));

  /**
   * Reads what the first dropdown points at. A draft is ranked by the projection it was played
   * against, which the second dropdown then shows; a Yahoo league keeps whatever that one says.
   */
  selectLeague(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value.startsWith('draft:')) {
      const id = value.slice('draft:'.length);
      this.picker.selectedKey.set(null);
      this.picker.error.set(null);
      this.draftId.set(id);
      const draft = this.drafts().find((candidate) => candidate.id === id);
      if (draft) {
        this.rankByDraftSource(draft);
      }
      return;
    }
    this.draftId.set(null);
    this.picker.select(event);
  }

  /**
   * Ranks by what a draft was played against, where that is still offered here: the preset it was
   * started from, or its board while the user still has it. Otherwise the choice stands.
   */
  private rankByDraftSource(draft: ProjectionSummaryResponse): void {
    const board = draft.sourceProjectionId;
    if (draft.preset === 'model' && this.modelOffered()) {
      this.chosenRankBy.set('model');
    } else if (draft.preset === 'last_season') {
      this.chosenRankBy.set('last_season');
    } else if (board && this.boards().some((candidate) => candidate.id === board)) {
      this.chosenRankBy.set(rankByBoard(board));
    }
  }

  /**
   * Reads the ESPN league the card has just checked with ESPN. Pressing its button again reads the
   * league again, which is how a reader sees the rosters as they are now.
   */
  rankEspnLeague(result: EspnSyncResult): void {
    this.espnLeague.set({ id: result.leagueId, name: result.leagueName ?? null });
  }

  /** Ranks by what the second dropdown points at, re-reading the league on screen if there is one. */
  selectRankBy(event: Event): void {
    this.chosenRankBy.set((event.target as HTMLSelectElement).value as RankBy);
  }

  /** Whether an option in the second dropdown is the one ranking the league, for `selected`. */
  isRankedBy(option: RankBy): boolean {
    return this.rankBy() === option;
  }

  retryRankings(): void {
    this.rankingsResource.reload();
  }
}
