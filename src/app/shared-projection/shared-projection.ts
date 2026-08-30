import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
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
import { PlayerRowComponent } from '../draft-projection/player-projections-table/player-row/player-row';
import { PositionFilterComponent } from '../draft-projection/player-projections-table/position-filter/position-filter';
import { ProjectionsTableHeaderComponent } from '../draft-projection/player-projections-table/projections-table-header/projections-table-header';
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
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';

/**
 * A published board is the owner's whole pool — some 1600 rows — and someone arriving from a link
 * came to read the top of it, not to scroll past everyone. The rest is a click away.
 */
const INITIAL_ROWS = 50;
const ROWS_PER_PAGE = 100;

/** Where a copy of the board lands: open for editing, or straight into a draft against it. */
type ImportDestination = 'projection' | 'draft';

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
    PlayerRowComponent,
    PositionFilterComponent,
    ProjectionsTableHeaderComponent,
    PinnedTableHeaderDirective,
    TooltipDirective,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(Location);

  readonly isLoggedIn = inject(AuthService).isLoggedIn;

  /** Which of the two buttons is waiting on the copy, so only that one says so. */
  readonly importingInto = signal<ImportDestination | null>(null);
  readonly isImporting = computed(() => this.importingInto() !== null);
  readonly alreadyImported = signal(false);

  /**
   * Which button a visitor without an account pressed, and therefore what the sign-in prompt is
   * about. Both buttons are offered to them on purpose: a copy is what the page is for, and
   * finding that out by pressing the thing you came to press beats reading it in a card first.
   */
  readonly signInPromptFor = signal<ImportDestination | null>(null);

  /**
   * Where the sign-in prompt sends them, and how the press survives the trip: the button they
   * chose rides back on the return URL, so the copy happens on arrival rather than asking them
   * to find the board and press the same thing twice.
   */
  readonly promptReturnUrl = computed(() => {
    const intent = this.signInPromptFor();
    return intent ? `${this.returnUrl}?action=${intent}` : this.returnUrl;
  });

  /**
   * Picks that press back up, once. Anything other than the two actions is ignored rather than
   * reported: the parameter is part of a URL a visitor may edit or a mail client may mangle, and
   * the page behind it reads fine without it.
   *
   * <p>The parameter comes off the address bar before the copy is attempted. An action left in
   * the URL is one a refresh would run again, and one that would follow the link if the visitor
   * passed it on: a board should be copied because someone pressed a button, not because a URL
   * said so. Arriving with an action but no session lands on the same prompt as pressing the
   * button would, which is what a sign-in that did not complete deserves.
   */
  private resumeRequestedAction(): void {
    const requested = this.route.snapshot.queryParamMap.get('action');
    if (requested !== 'draft' && requested !== 'projection') {
      return;
    }
    this.location.replaceState(this.returnUrl);
    this.importThen(requested);
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
   * The copy behind both buttons. What the visitor is looking at is a snapshot, and so is the
   * copy: the author's later edits are theirs, and their picks do not come along. Only where it
   * lands differs, which is the whole difference between the two buttons.
   */
  private importThen(destination: ImportDestination): void {
    // A copy has to live in an account, so someone without one is asked for it here rather than
    // being sent away and made to find their way back. The board stays on screen behind the ask.
    if (!this.isLoggedIn()) {
      this.signInPromptFor.set(destination);
      return;
    }
    this.importingInto.set(destination);
    this.alreadyImported.set(false);
    this.storage
      .importFromShare(this.token)
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
          // A clash on the name it was shared under almost always means this same board is
          // already in their account: nothing to fix, just somewhere else to go.
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.alreadyImported.set(true);
            return;
          }
          this.notification.error("Couldn't copy this board. Please try again.");
        },
      });
  }

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly positionFilter = signal<PositionFilter>('ALL');
  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');

  /**
   * Who decides what a column means here depends on how much of the board the reader holds.
   *
   * <p>Someone signed in holds all of it, so their request never changes and the board is fetched
   * once — the sorting below is the whole answer. Behind the gate the rows on screen are the top
   * of the board and the rest is not in the browser to be sorted, so the order goes to the BFF,
   * which applies it to the whole board and returns the top of *that*. Sorting by goals then
   * answers with the board's best scorers rather than the best among the rows already sent.
   */
  readonly sharedResource = rxResource({
    params: () =>
      this.isLoggedIn()
        ? null
        : {
            position: this.positionFilter(),
            sort: this.sortColumn(),
            direction: this.sortDirection(),
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
    this.resumeRequestedAction();

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

  readonly statWeights = signal<Record<ScoringStatKey, number>>(
    {} as Record<ScoringStatKey, number>,
  );
  readonly decimalSettings = computed<Record<DecimalStatKey, number>>(() => ({
    ...DEFAULT_DECIMAL_SETTINGS,
    ...((this.shared()?.data.settings.decimalSettings ?? {}) as Record<DecimalStatKey, number>),
  }));

  private readonly rows = computed<SharedRow[]>(() =>
    (this.shared()?.data.players ?? []).map((shared) => this.toRow(shared)),
  );

  /**
   * Sorted here as well as on the server, and not only for the reader who holds the whole board:
   * the BFF chooses *which* rows a gated visitor gets, and this puts the rows it sent in the same
   * order the editor's table would. Two orderings that agree, rather than one trusted blindly.
   */
  private readonly sortedRows = computed<SharedRow[]>(() => {
    const filtered = this.rows().filter((row) => this.matchesFilter(row));
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    return [...filtered].sort((first, second) => this.compare(first, second, column, sign));
  });

  /** How many rows are on screen. Back to the first page whenever the pool or its order changes:
   * a page grown deep under one sort is nothing to hold on to once the rows underneath it move. */
  readonly visibleCount = linkedSignal({
    source: () => ({
      position: this.positionFilter(),
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

  private matchesFilter(row: SharedRow): boolean {
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
