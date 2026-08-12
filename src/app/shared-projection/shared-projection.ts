import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { SharedPlayer } from '../api/models/shared-player';
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
import { ProjectionShareService } from '../services/projection-share.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';

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
  ],
  templateUrl: './shared-projection.html',
  styleUrl: './shared-projection.css',
})
export class SharedProjectionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly shareService = inject(ProjectionShareService);
  private readonly analytics = inject(AnalyticsService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly sharedResource = rxResource({
    stream: () => this.shareService.loadShared(this.token),
  });

  // Guarded rather than read straight off the resource: value() throws while the resource is in
  // an error state, and both the template and the analytics effect below read this on that path.
  readonly shared = computed(() =>
    this.sharedResource.hasValue() ? this.sharedResource.value() : undefined,
  );

  readonly positionFilter = signal<PositionFilter>('ALL');
  readonly sortColumn = signal<SortColumn>('summary');
  readonly sortDirection = signal<SortDirection>('desc');

  private viewCounted = false;

  constructor() {
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

  readonly visibleRows = computed<SharedRow[]>(() => {
    const filtered = this.rows().filter((row) => this.matchesFilter(row));
    const column = this.sortColumn();
    const sign = this.sortDirection() === 'asc' ? 1 : -1;
    return [...filtered].sort((first, second) => this.compare(first, second, column, sign));
  });

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
