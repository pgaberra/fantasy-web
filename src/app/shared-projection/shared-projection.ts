import { Component, computed, effect, inject, linkedSignal, Signal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { SharedPlayer } from '../api/models/shared-player';
import { SharedProjectionResponse } from '../api/models/shared-projection-response';
import { Player } from '../models/player.model';
import { SkaterPosition } from '../models/position.model';
import {
  ActiveColumns,
  PlayerScore,
  PositionFilter,
  Projection,
  ScoringType,
  SortColumn,
  SortDirection,
} from '../models/projection.model';
import { GoalieStats, SkaterStats } from '../models/projection.model';
import { compareStatValues, defaultSortDirection } from '../models/sorting';
import { ScoringStatKey, SkaterUtilityStatKey, StatKey } from '../models/stat-key.model';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
} from '../draft-projection/projection-settings-section/model';
import { readableDecimalSettings } from '../draft-projection/projection-settings-section/model-decimals';
import { PlayerRowComponent } from '../draft-projection/player-projections-table/player-row/player-row';
import { PositionFilterComponent } from '../draft-projection/player-projections-table/position-filter/position-filter';
import { TeamFilterComponent } from '../draft-projection/player-projections-table/team-filter/team-filter';
import { ProjectionsTableHeaderComponent } from '../draft-projection/player-projections-table/projections-table-header/projections-table-header';
import { ActiveColumnsService } from '../services/active-columns.service';
import { AnalyticsService } from '../services/analytics.service';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { PinnedTableHeaderDirective } from '../shared/pinned-table-header/pinned-table-header.directive';
import { TableScrollDirective } from '../shared/table-scroll/table-scroll.directive';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { hasHeadshots, PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { SHARED_BOARD } from '../auth/auth-reason';
import { environment } from '../../environments/environment';
import { ImportDestination, PendingCopyService } from './pending-copy';

/**
 * A published board is the owner's whole pool — some 1600 rows — and someone arriving from a link
 * came to read the top of it, not to scroll past everyone. The rest is a click away.
 */
const INITIAL_ROWS = 50;
const ROWS_PER_PAGE = 100;

/**
 * How long the search box settles before it becomes a request. Only a visitor behind the sign-in
 * gate makes one — the board is searched on the server there, since the rows they hold are its top
 * and the player they are looking for may be further down — and a request per keystroke would be
 * one answer arriving for every letter typed.
 */
const SEARCH_DEBOUNCE_MS = 250;

/** One published row, in the shapes the editor's table components expect. */
interface SharedRow {
  readonly shared: SharedPlayer;
  readonly player: Player;
  readonly projection: Projection;
  readonly score: PlayerScore;
}

/**
 * The page behind a share link. Public and unguarded: it renders the snapshot the owner
 * published and nothing else — no live data, no account, no player read model.
 *
 * <p>How much of that snapshot arrives depends on who asked. A signed-in reader gets the whole
 * board; anyone else gets the top of it and a prompt to sign in for the rest. The BFF decides
 * that and sends only what the reader may see, so the rows behind the prompt are not here to be
 * found — this page reports the cut rather than making it.
 *
 * <p>Which is why sorting and filtering behind that prompt are asked of the BFF rather than done
 * here: the answer to "who scores the most goals" is in the rows this page was not given, so it
 * sends the question up and renders the answer that comes back.
 *
 * <p>It reuses the editor's table row and header so a shared projection looks like the table it
 * came from, in a read-only mode. What it deliberately does not reuse is the scoring: the values
 * were computed against the owner's whole player pool, and recomputing them here — over the
 * hundred rows that were published — would quietly print different numbers than were shared.
 * So the published rank and value are rendered as they are.
 */
@Component({
  selector: 'app-shared-projection',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    PlayerHeadshotComponent,
    PlayerRowComponent,
    PositionFilterComponent,
    TeamFilterComponent,
    ProjectionsTableHeaderComponent,
    PinnedTableHeaderDirective,
    TableScrollDirective,
    TooltipDirective,
    RelativeTimePipe,
  ],
  templateUrl: './shared-projection.html',
  styleUrl: './shared-projection.css',
})
export class SharedProjectionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shareService = inject(ProjectionShareService);
  private readonly storage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly activeColumnsService = inject(ActiveColumnsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingCopy = inject(PendingCopyService);

  readonly isLoggedIn = inject(AuthService).isLoggedIn;

  /** Which of the two buttons is waiting on the copy, so only that one says so. */
  readonly importingInto = signal<ImportDestination | null>(null);
  readonly isImporting = computed(() => this.importingInto() !== null);

  /**
   * The last press was refused because the author changed the board after this page read it.
   * The board has been read again by then, so the note says why nothing was copied and that what
   * is on screen is now the latest. Cleared by the next press.
   */
  readonly boardChanged = signal(false);

  /**
   * A press picked back up on the way in is being copied, so the page is about to leave for the
   * editor. The board is not shown meanwhile: it would flash up for the second or two the copy
   * takes and then be replaced, which read as the sign-up having landed on the wrong page. Cleared
   * only when the copy fails, where the board is the right thing to fall back to.
   */
  readonly resumingCopy = signal(false);

  /**
   * Picks a press back up on the way in, for the visitor who made it and came back with an
   * account. Taken rather than read, so a copy answers one press: a reload, a second visit and a
   * second board each find nothing waiting.
   *
   * <p>Still signed out means the trip to the account form did not end in one, so the press is
   * spent and the board renders with both buttons on it — which is where they were.
   */
  private resumePendingCopy(): void {
    const pending = this.pendingCopy.take(this.token);
    if (!pending || !this.isLoggedIn()) {
      return;
    }
    this.resumingCopy.set(true);
    this.importThen(pending.destination, pending.seenUpdatedAt);
  }

  /** Takes a copy of the published board and opens it for editing. */
  copyToMyProjections(): void {
    this.importThen('projection');
  }

  /** Takes a copy and goes straight to drafting against it. */
  draftAgainstThis(): void {
    this.importThen('draft');
  }

  /**
   * The copy behind both buttons. A link follows its projection, so the author can change the
   * board while the visitor reads it; the press carries the stamp of the board on screen, and a
   * board changed since is refused (412) rather than copied, then read again. The author's picks
   * never come along. Only where the copy lands differs, which is the whole difference between
   * the two buttons.
   *
   * <p>Pressing either a second time makes a second copy, and that is the point. The name it
   * was shared under is taken by then, which db-service used to answer with a 409 — this page
   * turned that into "you already have a copy of this board", with links to go and find it.
   * Someone who pressed a button on a board wanted a board, and being handed directions
   * instead was the annoyance. The server now numbers the copy (`My league (2)`), so both
   * buttons simply do what they say however often they are pressed, and a 409 goes back to
   * meaning something went wrong.
   */
  private importThen(
    destination: ImportDestination,
    seenUpdatedAt: string | undefined = this.shared()?.updatedAt,
  ): void {
    // A copy has to live in an account, so someone without one is taken straight to the form that
    // makes one. It used to be a note beside the buttons holding two links, which asked a visitor
    // who had already decided to read a sentence and decide again. The press is written down
    // first, so the copy happens when they land back here; the form's own footer is the way out
    // for someone who turns out to have an account already.
    if (!this.isLoggedIn()) {
      this.pendingCopy.remember(this.token, destination, seenUpdatedAt);
      void this.router.navigate(['/register'], {
        queryParams: { returnUrl: this.returnUrl, reason: SHARED_BOARD },
      });
      return;
    }
    this.importingInto.set(destination);
    this.boardChanged.set(false);
    this.storage
      .importFromShare(this.token, undefined, seenUpdatedAt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.analytics.capture('shared_projection_imported', { destination });
          void this.router.navigate(
            destination === 'draft'
              ? ['/projections', projection.id, 'draft']
              : ['/projections', projection.id],
          );
        },
        error: (error: unknown) => {
          this.importingInto.set(null);
          this.resumingCopy.set(false);
          if (error instanceof HttpErrorResponse && error.status === 412) {
            this.boardChanged.set(true);
            // After a resumed copy the board was never read, and letting go of it above has
            // already started its first fetch; reload() does nothing while one is in flight.
            this.sharedResource.reload();
            return;
          }
          this.notification.error("Couldn't copy this board. Please try again.");
        },
      });
  }

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  private readonly positionFilterState = signal<PositionFilter>('ALL');
  readonly positionFilter: Signal<PositionFilter> = this.positionFilterState.asReadonly();
  readonly searchTerm = signal('');
  readonly teamFilter = signal('ALL');
  readonly rookiesOnly = signal(false);
  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  private readonly settledSearch = toSignal(
    toObservable(this.searchTerm).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
    { initialValue: '' },
  );

  /**
   * The term the rows on screen were chosen by. For a reader holding the whole board that is
   * whatever is in the box, filtered as they type; behind the gate the rows are the server's
   * answer to the settled term, and narrowing them by a half-typed name would empty the table
   * between the keystroke and the answer.
   */
  private readonly appliedSearch = computed(() =>
    this.isLoggedIn() ? this.searchTerm() : this.settledSearch(),
  );

  /**
   * The teams and the rookies the controls offer, both read off the whole published board rather
   * than the rows in hand: behind the gate those are its top 25, and a team list built from them
   * would offer a handful of clubs and quietly hide the rest.
   */
  readonly availableTeams = computed<string[]>(() => this.shared()?.teams ?? []);

  private readonly rookieIds = computed(() => new Set(this.shared()?.rookieIds ?? []));

  /** Nobody being a rookie and nobody being able to say read the same here: no filter, no mark. */
  readonly rookiesAvailable = computed(() => this.rookieIds().size > 0);

  isRookie(playerId: number): boolean {
    return this.rookieIds().has(playerId);
  }

  /**
   * Narrowing to a position can take the sorted column off the screen with it: a board of left
   * wings has no goalie columns to sort by. Rather than leave the rows in an order nothing on
   * screen explains, the sort falls back to the published ranking.
   */
  setPositionFilter(filter: PositionFilter): void {
    this.positionFilterState.set(filter);
    if (
      this.activeColumnsService.showsSortColumn(this.sortColumn(), this.activeColumns(), filter)
    ) {
      return;
    }
    this.sortColumn.set('summary');
    this.sortDirection.set(defaultSortDirection('summary'));
  }

  /**
   * Who decides what a column means here depends on how much of the board the reader holds.
   *
   * <p>Someone signed in holds all of it, so their request never changes and the board is fetched
   * once — the sorting below is the whole answer. Behind the gate the rows on screen are the top
   * of the board and the rest is not in the browser to be sorted, so the order goes to the BFF,
   * which applies it to the whole board and returns the top of *that*. Sorting by goals then
   * answers with the board's best scorers rather than the best among the rows already sent.
   *
   * <p>Nothing is fetched while a resumed copy is under way: the page is about to leave for the
   * editor, and the whole board read in the background meanwhile would be read for nobody. The
   * params are undefined then, which leaves the resource idle, and distinct from the null that
   * asks for the whole board; the board is fetched only if the copy fails and the page stays.
   */
  readonly sharedResource = rxResource({
    params: () => {
      if (this.resumingCopy()) {
        return undefined;
      }
      if (this.isLoggedIn()) {
        return null;
      }
      return {
        position: this.positionFilter(),
        search: this.settledSearch(),
        team: this.teamFilter(),
        rookies: this.rookiesOnly(),
        sort: this.sortColumn(),
        direction: this.sortDirection(),
      };
    },
    stream: ({ params }) => this.shareService.loadShared(this.token, params ?? undefined),
  });

  /**
   * The board on screen. Held across a reload rather than read straight off the resource: a new
   * order is a new request, which empties the resource's value while it is in flight, and a page
   * that blanked to a spinner on every click of a column heading would be a worse answer than the
   * one it replaces. The rows are also read here on the error path, where value() throws.
   */
  readonly shared = linkedSignal<
    SharedProjectionResponse | undefined,
    SharedProjectionResponse | undefined
  >({
    source: () => (this.sharedResource.hasValue() ? this.sharedResource.value() : undefined),
    computation: (loaded, previous) => loaded ?? previous?.value,
  });

  /** A reorder in flight, as opposed to the first load: the table is on screen and going stale. */
  readonly isReordering = computed(() => this.sharedResource.isLoading() && !!this.shared());

  private viewCounted = false;

  constructor() {
    this.resumePendingCopy();

    // The other half of the sharing loop: projection_shared is captured when a link is made,
    // this when someone actually opens one.
    effect(() => {
      if (!this.viewCounted && this.shared()) {
        this.viewCounted = true;
        this.analytics.capture('shared_projection_viewed');
      }
    });
  }

  /** A dead or withdrawn link is a normal outcome here, not a fault to offer a retry for. */
  readonly isGone = computed(() => {
    const error = this.sharedResource.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  readonly authorLabel = computed(() => this.shared()?.authorUsername ?? '');

  /**
   * Where the author's picture is served, or undefined where they have none — the byline then
   * shows the initial of their name, as the header does for an account that never uploaded one.
   * The address comes from the BFF as a path relative to the API, carrying a stamp that changes
   * when the picture does, so the browser may cache it and still not miss a new one.
   */
  readonly authorAvatar = computed(() => {
    const path = this.shared()?.authorAvatar;
    return path ? `${environment.apiUrl}${path}` : undefined;
  });

  /** True when rows were withheld because the reader is not signed in. */
  readonly isTruncated = computed(() => this.shared()?.truncated ?? false);

  /** How many rows the published board holds, whether or not this reader received them all. */
  readonly totalPlayers = computed(() => this.shared()?.totalPlayers ?? 0);

  /** Back to this page once they have signed in — the board is what they came for. */
  readonly returnUrl = `/s/${this.token}`;

  readonly scoringType = computed<ScoringType>(
    () => this.shared()?.data.settings.scoringType ?? 'points',
  );

  readonly leagueSummary = computed(() => {
    const settings = this.shared()?.data.settings;
    if (!settings) {
      return '';
    }
    const scoring = settings.scoringType === 'points' ? 'Points league' : 'Category league';
    return settings.leagueSize ? `${scoring} · ${settings.leagueSize} teams` : scoring;
  });

  readonly activeColumns = computed<ActiveColumns>(() => {
    const settings = this.shared()?.data.settings;
    return {
      scoring: new Set((settings?.activeScoringColumns ?? []) as ScoringStatKey[]),
      utility: new Set((settings?.activeUtilityColumns ?? []) as SkaterUtilityStatKey[]),
    };
  });

  /**
   * The columns a filtered board still has values for. Goalie columns against a screen of left
   * wings are columns of dashes, and skater columns against a screen of goalies are the same, so
   * the position filter decides which stats are shown exactly as it does in the editor.
   */
  readonly filteredActiveColumns = computed<ActiveColumns>(() =>
    this.activeColumnsService.filterAndSortActiveColumns(
      this.activeColumns(),
      this.positionFilter(),
    ),
  );

  readonly statWeights = signal<Record<ScoringStatKey, number>>(
    {} as Record<ScoringStatKey, number>,
  );
  /**
   * The published board's own decimals, and a place after the point for any column whose numbers
   * have one — the AI projection's do, and the editor this snapshot was taken in shows them.
   * A shared board has to read as the board it was.
   */
  readonly decimalSettings = computed<Record<DecimalStatKey, number>>(() =>
    readableDecimalSettings(
      this.rows().map((row) => row.projection),
      {
        ...DEFAULT_DECIMAL_SETTINGS,
        ...((this.shared()?.data.settings.decimalSettings ?? {}) as Record<DecimalStatKey, number>),
      },
      this.shared()?.data.settings.useDefaultDecimals ?? true,
    ),
  );

  private readonly rows = computed<SharedRow[]>(() =>
    (this.shared()?.data.players ?? []).map((shared) => this.toRow(shared)),
  );

  /** Whether the rows draw headshots at all: not while no published player has a picture. */
  readonly showHeadshots = computed(() => hasHeadshots(this.shared()?.data.players ?? []));

  /**
   * Where each row sits within the position being filtered for. The board ranked every player
   * together, so under a position filter the top row is the best left wing rather than the best
   * player, and saying "1" alone would lose which of the two the number is. It is counted off the
   * published ranking rather than the column being sorted, so it stays the board's own answer
   * however the reader has arranged it.
   *
   * <p>Empty while the whole board is on screen, where the published rank is the answer already.
   */
  private readonly positionRanks = computed<Map<number, number>>(() => {
    if (this.positionFilter() === 'ALL') {
      return new Map();
    }
    const withinPosition = this.rows()
      .filter((row) => this.matchesPosition(row))
      .sort((first, second) => first.shared.rank - second.shared.rank);
    return new Map(withinPosition.map((row, index) => [row.shared.playerId, index + 1]));
  });

  /** The number in the # column: the position's rank where there is one, the board's otherwise. */
  rankOf(row: SharedRow): number {
    return this.positionRanks().get(row.shared.playerId) ?? row.shared.rank;
  }

  /** The board-wide rank, shown in brackets only when the rank beside it is a position's. */
  overallRankOf(row: SharedRow): number | null {
    return this.positionRanks().has(row.shared.playerId) ? row.shared.rank : null;
  }

  /**
   * Sorted here as well as on the server, and not only for the reader who holds the whole board:
   * the BFF chooses *which* rows a gated visitor gets, and this puts the rows it sent in the same
   * order the editor's table would. Two orderings that agree, rather than one trusted blindly.
   */
  private readonly sortedRows = computed<SharedRow[]>(() => {
    const filtered = this.rows().filter((row) => this.matches(row));
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    return [...filtered].sort((first, second) => this.compare(first, second, column, sign));
  });

  /** How many rows are on screen. Back to the first page whenever the pool or its order changes:
   * a page grown deep under one sort is nothing to hold on to once the rows underneath it move. */
  readonly visibleCount = linkedSignal({
    source: () => ({
      position: this.positionFilter(),
      search: this.appliedSearch(),
      team: this.teamFilter(),
      rookiesOnly: this.rookiesOnly(),
      sortColumn: this.sortColumn(),
      sortDirection: this.sortDirection(),
    }),
    computation: () => INITIAL_ROWS,
  });

  /** Rows the reader received that match the filter — what the footer counts against. The board's
   * total is a different number, and the gate below the table is where it is named: the two read
   * as one sentence only because the gate speaks of what the link opens, not of what is on
   * screen. */
  readonly matchingCount = computed(() => this.sortedRows().length);

  readonly visibleRows = computed<SharedRow[]>(() =>
    this.sortedRows().slice(0, this.visibleCount()),
  );

  readonly hasMore = computed(() => this.visibleCount() < this.matchingCount());

  showMore(): void {
    this.visibleCount.update((count) => count + ROWS_PER_PAGE);
  }

  onSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this.sortColumn.set(column);
    this.sortDirection.set(defaultSortDirection(column));
  }

  private compare(first: SharedRow, second: SharedRow, column: SortColumn, sign: number): number {
    if (column === 'name') {
      return sign * first.player.name.localeCompare(second.player.name);
    }
    if (column === 'summary') {
      // The published order, which is what the ranking said when it was shared. Reversed against
      // the others because rank counts the good way down: rank 1 is the top of the table.
      return sign * (second.shared.rank - first.shared.rank);
    }
    return compareStatValues(
      this.statValue(first.shared, column),
      this.statValue(second.shared, column),
      sign,
    );
  }

  /** Null rather than a sentinel low value, so a stat the player cannot have sorts last either way. */
  private statValue(shared: SharedPlayer, key: StatKey): number | null {
    const stats: Record<string, number | undefined> = {
      ...shared.stats.utility,
      ...shared.stats.scoring,
    };
    return stats[key] ?? null;
  }

  /** Every control at once, which is what decides whether a row is on screen. */
  private matches(row: SharedRow): boolean {
    return (
      this.matchesPosition(row) &&
      this.matchesSearch(row) &&
      this.matchesTeam(row) &&
      this.matchesRookie(row)
    );
  }

  private matchesPosition(row: SharedRow): boolean {
    const filter = this.positionFilter();
    if (filter === 'ALL') {
      return true;
    }
    if (filter === 'G') {
      return row.shared.type === 'goalie';
    }
    if (filter === 'SKATER') {
      return row.shared.type === 'skater';
    }
    return (row.shared.positions ?? []).includes(filter);
  }

  private matchesSearch(row: SharedRow): boolean {
    const term = this.appliedSearch().trim().toLowerCase();
    return !term || row.shared.name.toLowerCase().includes(term);
  }

  private matchesTeam(row: SharedRow): boolean {
    const team = this.teamFilter();
    return team === 'ALL' || row.shared.teamAbbrev === team;
  }

  /** A board nobody can name the rookies on is left whole rather than narrowed to nothing. */
  private matchesRookie(row: SharedRow): boolean {
    if (!this.rookiesOnly() || !this.rookiesAvailable()) {
      return true;
    }
    return this.rookieIds().has(row.shared.playerId);
  }

  /**
   * The snapshot carries everything the row needs — identity was denormalised into it at share
   * time precisely so this page needs nothing else. `stats` on the Player is the read model's
   * measured season, which a row never reads; the projected stats are what it renders.
   */
  private toRow(shared: SharedPlayer): SharedRow {
    const stats = { utility: shared.stats.utility, scoring: shared.stats.scoring };
    const player: Player =
      shared.type === 'goalie'
        ? {
            id: shared.playerId,
            type: 'goalie',
            name: shared.name,
            teamAbbrev: shared.teamAbbrev,
            headshot: shared.headshot,
            stats: stats as GoalieStats,
          }
        : {
            id: shared.playerId,
            type: 'skater',
            name: shared.name,
            teamAbbrev: shared.teamAbbrev,
            headshot: shared.headshot,
            positions: new Set((shared.positions ?? []) as SkaterPosition[]),
            stats: stats as SkaterStats,
          };
    const projection =
      shared.type === 'goalie'
        ? ({ playerId: shared.playerId, type: 'goalie', stats: stats as GoalieStats } as Projection)
        : ({
            playerId: shared.playerId,
            type: 'skater',
            stats: stats as SkaterStats,
          } as Projection);
    return {
      shared,
      player,
      projection,
      score: { fantasyPoints: shared.value, zScore: shared.value },
    };
  }
}
