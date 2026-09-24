import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  Signal,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
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
import { IconComponent } from '../shared/icon/icon';
import { PinnedTableHeaderDirective } from '../shared/pinned-table-header/pinned-table-header.directive';
import { TableScrollDirective } from '../shared/table-scroll/table-scroll.directive';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { hasHeadshots, PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { SHARED_BOARD } from '../auth/auth-reason';
import { environment } from '../../environments/environment';
import { NoticeComponent } from '../shared/notice/notice';
import { PendingCopyService, SharedAction } from './pending-copy';
import { renameOnOpenExtras } from '../draft-projection/rename-intent';
import { rowWindow } from '../shared/row-window/row-window';

/**
 * A published board is the owner's whole pool — some 1600 rows — and someone arriving from a link
 * came to read the top of it, not to scroll past everyone. Each step down roughly doubles what is
 * on screen: the first four rounds of a twelve-team draft, the next four, about every rostered
 * player in a normal league, the waiver wire behind them, then the whole pool. Show less walks
 * back up the same steps.
 */
const ROW_STEPS = [50, 100, 200, 300, Infinity] as const;

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
 * <p>Every reader gets the whole board, signed in or not, and sorts, filters and searches it here.
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
    IconComponent,
    PlayerHeadshotComponent,
    PlayerRowComponent,
    PositionFilterComponent,
    TeamFilterComponent,
    ProjectionsTableHeaderComponent,
    PinnedTableHeaderDirective,
    TableScrollDirective,
    TooltipDirective,
    RelativeTimePipe,
    NoticeComponent,
  ],
  templateUrl: './shared-projection.html',
  styleUrl: './shared-projection.css',
})
export class SharedProjectionComponent {
  protected readonly sharedNotice = environment.sharedNoticeEnabled;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shareService = inject(ProjectionShareService);
  private readonly storage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly activeColumnsService = inject(ActiveColumnsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingCopy = inject(PendingCopyService);
  private readonly injector = inject(Injector);
  private readonly tableFooter = viewChild<ElementRef<HTMLElement>>('tableFooter');

  readonly isLoggedIn = inject(AuthService).isLoggedIn;

  /** Which button is waiting on the server, so only that one says so. */
  readonly pressed = signal<SharedAction | 'unfollow' | null>(null);
  readonly isBusy = computed(() => this.pressed() !== null);

  /**
   * The reader's follow of this link, if they hold one, read from their projections when the page
   * opens. Without it the button only knew about a press made on this page, so a reload offered
   * Follow again to someone already following, and the press that followed was answered with a
   * remark rather than a button that said so from the start.
   *
   * <p>Only asked for a reader who is signed in: nobody else can hold a follow, and their press
   * goes to the account form first anyway. A follow is the one row that carries the link it came
   * from (`origin`), and the server keeps one per reader and link, so the first match is the one.
   */
  private readonly followLookup = rxResource({
    params: () => (this.isLoggedIn() ? this.token : undefined),
    stream: ({ params: token }) =>
      this.storage
        .listAll()
        .pipe(
          map(
            (projections) =>
              projections.find((projection) => projection.origin?.shareToken === token)?.id ?? null,
          ),
        ),
  });

  /**
   * The id of the follow, which is what Unfollow deletes. Seeded from the lookup and then kept by
   * the presses on this page. A lookup that lands after a press has already followed never undoes
   * it: the press is the newer word. A lookup that fails leaves the button on Follow, which is
   * still right to press — the server hands back the follow already held, and the button turns
   * to Unfollow from there — so it is not surfaced on top of a board the reader came to read.
   */
  readonly followId = linkedSignal<string | null | undefined, string | null>({
    source: () => (this.followLookup.hasValue() ? this.followLookup.value() : undefined),
    computation: (found, previous) => found ?? previous?.value ?? null,
  });

  /** The board is followed, whether found so on the way in or followed from here. */
  readonly isFollowing = computed(() => this.followId() !== null);

  /** The follow state is still being read, so the button cannot yet say which it is. */
  readonly isCheckingFollow = computed(() => this.followLookup.isLoading());

  /**
   * Why a press on Follow did nothing — the reader's own board, a link taken down — kept beside the
   * button because it stays true. A follow or unfollow that worked is confirmed in a toast instead.
   */
  readonly followNote = signal<string | null>(null);

  /**
   * The last press was refused because the author changed the board after this page read it.
   * The board has been read again by then, so the note says why nothing was copied and that what
   * is on screen is now the latest. Cleared by the next press.
   */
  readonly boardChanged = signal(false);

  /**
   * A press picked back up on the way in is being acted on, so the page is about to leave for the
   * editor. The board is not shown meanwhile: it would flash up for the second or two the copy
   * takes and then be replaced, which read as the sign-up having landed on the wrong page. Cleared
   * once the press is answered, where the board is the right thing to fall back to.
   */
  readonly resumingPress = signal(false);

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
    if (pending.action === 'follow') {
      // A follow stays on this page, so the board is wanted: only a copy leaves for the editor.
      this.follow();
      return;
    }
    this.resumingPress.set(true);
    this.copyThen(pending.action, pending.seenUpdatedAt);
  }

  /** Takes a copy of the published projection and opens it for editing. */
  copyToMyProjections(): void {
    this.copyThen('projection');
  }

  /** Takes a copy and goes straight to drafting against it. */
  draftAgainstThis(): void {
    this.copyThen('draft');
  }

  /**
   * Follows the board instead of copying it: it joins the reader's projections under the author's
   * name, read-only apart from their own draft, and is rewritten whenever the author shares it
   * again. The page stays where it is, because the reader came here to read the board and a press
   * that files it away is no reason to take it off their screen.
   *
   * <p>No stamp is sent with it. A copy is refused when the author has moved the board since this
   * page read it, since the reader would otherwise be handed numbers they never saw; a follow has
   * no such moment, as it shows whatever the author last published from here on.
   */
  follow(): void {
    if (!this.isLoggedIn()) {
      this.pendingCopy.remember(this.token, 'follow');
      void this.router.navigate(['/register'], {
        queryParams: { returnUrl: this.returnUrl, reason: SHARED_BOARD },
      });
      return;
    }
    this.pressed.set('follow');
    this.boardChanged.set(false);
    this.followNote.set(null);
    this.storage
      .followShare(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.pressed.set(null);
          this.followId.set(result.projection.id);
          // A toast, not a line under the button: the button now saying Unfollow is what stays
          // true, and a confirmation left on the page reads as news long after it was.
          this.notification.success(
            result.alreadyFollowed
              ? 'You already follow this projection.'
              : 'Added to My Projections.',
          );
          if (!result.alreadyFollowed) {
            this.analytics.capture('shared_projection_followed');
          }
        },
        error: (error: unknown) => {
          this.pressed.set(null);
          // Their own board: the author opened their own link, and there is nothing to follow.
          if (error instanceof HttpErrorResponse && error.status === 400) {
            this.followNote.set('This is your own projection.');
            return;
          }
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.followNote.set('This share link is no longer active.');
            return;
          }
          this.notification.error("Couldn't follow this projection. Please try again.");
        },
      });
  }

  /**
   * Takes the follow back off the reader's projections, for the press that was a mis-click or a
   * change of mind. Nothing the reader made goes with it: the board is the author's, rewritten on
   * every publish, and a draft played against it is a row of its own that outlives it. So there
   * is no confirmation, and Follow is right there to undo it.
   */
  unfollow(): void {
    const id = this.followId();
    if (id === null) {
      return;
    }
    this.pressed.set('unfollow');
    this.boardChanged.set(false);
    this.followNote.set(null);
    this.storage
      .deleteProjection(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.unfollowed(),
        error: (error: unknown) => {
          // Already gone — removed from My Projections in another tab, or the author took the
          // link down, which takes its follows with it. Either way it is no longer followed.
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.unfollowed();
            return;
          }
          this.pressed.set(null);
          this.notification.error("Couldn't unfollow this projection. Please try again.");
        },
      });
  }

  private unfollowed(): void {
    this.pressed.set(null);
    this.followId.set(null);
    this.notification.success('Removed from My Projections.');
    this.analytics.capture('shared_projection_unfollowed');
  }

  /**
   * The copy behind both buttons. A copy is the reader's own projection from that moment on: the
   * numbers as they are published now, with nothing the author does afterwards reaching it, and
   * none of their picks. The press carries the stamp of the projection on screen, and one its
   * author has changed since is refused (412) rather than copied, then read again. Only where the
   * copy lands differs, which is the whole difference between the two buttons.
   *
   * <p>Pressing either a second time makes a second copy, and that is the point: the server
   * numbers the name ("Copy of My league (2)") rather than refusing, so both buttons do what they
   * say however often they are pressed. Copying does not follow the board: Follow beside them is
   * the press for that, and one press does one thing.
   *
   * <p>The editor is opened with its rename waiting, because the name the server chose names the
   * projection it came from and not the one the reader is about to build.
   */
  private copyThen(
    destination: Exclude<SharedAction, 'follow'>,
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
    this.pressed.set(destination);
    this.boardChanged.set(false);
    this.followNote.set(null);
    this.storage
      .copyFromShare(this.token, seenUpdatedAt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.analytics.capture('shared_projection_imported', { destination });
          void (destination === 'draft'
            ? this.router.navigate(['/draft/new/board', projection.id])
            : this.router.navigate(['/projections', projection.id], renameOnOpenExtras));
        },
        error: (error: unknown) => {
          this.pressed.set(null);
          this.resumingPress.set(false);
          if (error instanceof HttpErrorResponse && error.status === 412) {
            this.boardChanged.set(true);
            // After a resumed copy the board was never read, and letting go of it above has
            // already started its first fetch; reload() does nothing while one is in flight.
            this.sharedResource.reload();
            return;
          }
          this.notification.error("Couldn't copy this projection. Please try again.");
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

  /** The teams and the rookies the controls offer, as the BFF reads them off the board. */
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
   * The whole board, fetched once; every control below works on it in the browser. Nothing is
   * fetched while a resumed copy is under way: the page is about to leave for the editor, and the
   * board read in the background meanwhile would be read for nobody. The params are undefined
   * then, which leaves the resource idle; the board is fetched only if the copy fails and the page
   * stays.
   */
  readonly sharedResource = rxResource({
    params: () => (this.resumingPress() ? undefined : this.token),
    stream: ({ params: token }) => this.shareService.loadShared(token),
  });

  /**
   * The board on screen. Held across a reload rather than read straight off the resource: the
   * board read again after a refused copy empties the resource's value while it is in flight, and
   * the table should not blank to a spinner meanwhile. The rows are also read here on the error
   * path, where value() throws.
   */
  readonly shared = linkedSignal<
    SharedProjectionResponse | undefined,
    SharedProjectionResponse | undefined
  >({
    source: () => (this.sharedResource.hasValue() ? this.sharedResource.value() : undefined),
    computation: (loaded, previous) => loaded ?? previous?.value,
  });

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

  /** The weights the published totals were scored with — the weight row says them to a visitor. */
  readonly statWeights = computed<Record<ScoringStatKey, number>>(
    () => (this.shared()?.data.settings.statWeights ?? {}) as Record<ScoringStatKey, number>,
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

  private readonly sortedRows = computed<SharedRow[]>(() => {
    const filtered = this.rows().filter((row) => this.matches(row));
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    return [...filtered].sort((first, second) => this.compare(first, second, column, sign));
  });

  /** Which of {@link ROW_STEPS} is on screen. Back to the first whenever the pool or its order
   * changes: a page grown deep under one sort is nothing to hold on to once the rows underneath it
   * move. */
  readonly rowStep = linkedSignal({
    source: () => ({
      position: this.positionFilter(),
      search: this.searchTerm(),
      team: this.teamFilter(),
      rookiesOnly: this.rookiesOnly(),
      sortColumn: this.sortColumn(),
      sortDirection: this.sortDirection(),
    }),
    computation: () => 0,
  });

  readonly visibleCount = computed(() => ROW_STEPS[this.rowStep()]);

  /** Rows that match the filter — what the footer counts against. */
  readonly matchingCount = computed(() => this.sortedRows().length);

  readonly visibleRows = computed<SharedRow[]>(() =>
    this.sortedRows().slice(0, this.visibleCount()),
  );

  readonly hasMore = computed(() => this.visibleCount() < this.matchingCount());

  private readonly drawnBody = viewChild<ElementRef<HTMLElement>>('drawnRows');

  /** The part of {@link visibleRows} near the screen — all that is drawn, whatever the step. */
  readonly drawn = rowWindow(this.visibleRows, this.drawnBody);

  readonly hasLess = computed(() => this.rowStep() > 0);

  /** What the next step shows — "Show top 200", or "Show all 1612" once it reaches the end. */
  readonly showMoreLabel = computed(() => {
    const next = ROW_STEPS[Math.min(this.rowStep() + 1, ROW_STEPS.length - 1)];
    return next < this.matchingCount() ? `Show top ${next}` : `Show all ${this.matchingCount()}`;
  });

  showMore(): void {
    this.rowStep.update((step) => Math.min(step + 1, ROW_STEPS.length - 1));
  }

  /** One step back. The rows it drops sit above the footer, so the page is brought back to the
   * footer — otherwise the reader is left looking at whatever came after a now-shorter table. */
  showLess(): void {
    this.rowStep.update((step) => Math.max(step - 1, 0));
    afterNextRender(() => this.tableFooter()?.nativeElement.scrollIntoView({ block: 'nearest' }), {
      injector: this.injector,
    });
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
    const term = this.searchTerm().trim().toLowerCase();
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
