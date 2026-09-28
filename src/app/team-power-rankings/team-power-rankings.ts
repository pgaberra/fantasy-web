import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { FeatureService } from '../services/feature.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { LeagueProjectionTableComponent } from '../draft-mode/league-projection-table/league-projection-table';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { NoticeComponent } from '../shared/notice/notice';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { YahooMarkComponent } from '../shared/yahoo-mark/yahoo-mark';
import { leagueProjectionFrom, scoreHeadingFor } from './power-rankings-data';
import { powerRankingsMessage, powerRankingsRetryable } from './power-rankings-error';
import { RankBy, rankByBoard } from './rank-by';

/**
 * How a league's teams stack up today, for a manager who plays on Yahoo rather than here.
 *
 * <p>Nothing is saved. The page is a read of a league that already exists somewhere else, so it
 * holds no board, no draft and no row of its own: leaving it and coming back reads the league
 * again. That is also why no players are ever posted — the league key is the whole of what this
 * page sends, and the BFF reads the rosters from Yahoo itself.
 *
 * <p>The totals are everyone's; the players behind them are Premium's. Which is why the numbers
 * are computed on the server and this page only draws them.
 *
 * <p>The league is picked the way every other screen picks one — the shared
 * {@link YahooLeaguePicker} behind a dropdown — so that choosing a league means the same thing
 * here as in draft setup. The dropdown stays put once a league is read, because reading a second
 * league is the obvious next thing to do and it should not cost a trip back to a list. A link can
 * name the league to open on (`?league=<key>`): a finished draft that followed a Yahoo league
 * sends its reader here, since this is where what the draft came to is shown.
 *
 * <p>What the league is ranked against is a second dropdown: the AI projection by default, last
 * season, or any board of the user's own or one they follow.
 *
 * <p>Neither dropdown has a button. Nothing here is saved or sent anywhere but to be read, so
 * there is nothing to confirm: what the two point at is what is on screen, and an account with
 * one league opens on its rankings.
 */
@Component({
  selector: 'app-team-power-rankings',
  imports: [
    RouterLink,
    LeagueProjectionTableComponent,
    ErrorStateComponent,
    IconComponent,
    LoadingIndicatorComponent,
    YahooMarkComponent,
    NoticeComponent,
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

  /** The league picker every screen shares, so choosing a league means the same thing here. */
  readonly picker = inject(YahooLeaguePicker);

  protected readonly sharedNotice = environment.sharedNoticeEnabled;

  /** The league being read: whichever one the dropdown points at. */
  readonly leagueKey = computed(() => this.picker.selectedKey());

  readonly offered = computed(() => this.features.leagueDraftSync());

  ngOnInit(): void {
    if (this.offered()) {
      this.picker.start(this.route.snapshot.queryParamMap.get('league'));
    }
  }

  /** Whether this environment serves the AI projection, which is then what ranks by default. */
  readonly modelOffered = computed(() => this.features.aiProjection());

  /** The boards a league can be ranked against: everything the editor opens, drafts left out. */
  private readonly boardsResource = rxResource({
    params: () => (this.offered() ? true : undefined),
    stream: () => this.storage.listEditable(),
  });

  private readonly boards = computed<ProjectionSummaryResponse[]>(() =>
    this.boardsResource.hasValue() ? this.boardsResource.value() : [],
  );

  /** The user's own boards: made here, copied from a link, or uploaded from a spreadsheet. */
  readonly ownBoards = computed(() => this.boards().filter((board) => !board.origin));

  /** Boards followed through a share link, whose numbers are their author's. */
  readonly followedBoards = computed(() => this.boards().filter((board) => !!board.origin));

  readonly boardsFailed = computed(() => !!this.boardsResource.error());

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
    return data.source === 'last_season' ? "last season's stats" : 'the SlapStat AI projection';
  });

  private readonly rankingsResource = rxResource({
    params: () => {
      const leagueKey = this.leagueKey();
      return leagueKey ? { leagueKey, rankBy: this.rankBy() } : undefined;
    },
    stream: ({ params }) => this.rankings.yahooLeague(params.leagueKey, params.rankBy),
  });

  readonly loadingRankings = computed(() => this.rankingsResource.isLoading());
  readonly rankingsData = computed<LeagueSummaryResponse | null>(() =>
    this.rankingsResource.hasValue() ? this.rankingsResource.value() : null,
  );
  readonly rankingsError = computed(() => this.rankingsResource.error());

  /** Whether there are leagues to choose from and none chosen, which is worth saying. */
  readonly awaitingLeague = computed(
    () =>
      !!this.picker.connected() &&
      !this.picker.loadingLeagues() &&
      this.picker.leagues().length > 0 &&
      !this.leagueKey(),
  );

  readonly leagueName = computed(() => {
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
    return error ? powerRankingsMessage(error) : null;
  });

  readonly rankingsRetryable = computed(() => powerRankingsRetryable(this.rankingsError()));

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
