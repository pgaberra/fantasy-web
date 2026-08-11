import { Component, computed, effect, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { SharedPlayer } from '../api/models/shared-player';
import { StatKey } from '../models/stat-key.model';
import { STAT_LABELS } from '../pipes/stat-label.pipe';
import { AnalyticsService } from '../services/analytics.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';

/** Kept short so the table stays readable on a phone, where most shared links get opened. */
const MAX_STAT_COLUMNS = 8;

interface StatColumn {
  key: StatKey;
  label: string;
  decimals: number;
}

/**
 * The page behind a share link. Public and unguarded: it renders the snapshot the owner
 * published and nothing else — no live data, no account, no player read model.
 */
@Component({
  selector: 'app-shared-projection',
  imports: [DecimalPipe, RouterLink, LoadingIndicatorComponent, ErrorStateComponent],
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

  readonly valueLabel = computed(() =>
    this.shared()?.data.settings.scoringType === 'points' ? 'Fan Pts' : 'Z-Score',
  );

  readonly players = computed<SharedPlayer[]>(() => this.shared()?.data.players ?? []);

  readonly statColumns = computed<StatColumn[]>(() => {
    const settings = this.shared()?.data.settings;
    if (!settings) {
      return [];
    }
    return settings.activeScoringColumns
      .slice(0, MAX_STAT_COLUMNS)
      .filter((key): key is StatKey => key in STAT_LABELS)
      .map((key) => ({
        key,
        label: STAT_LABELS[key],
        decimals: settings.decimalSettings[key] ?? 0,
      }));
  });

  readonly leagueSummary = computed(() => {
    const settings = this.shared()?.data.settings;
    if (!settings) {
      return '';
    }
    const scoring = settings.scoringType === 'points' ? 'Points league' : 'Category league';
    return settings.leagueSize ? `${scoring} · ${settings.leagueSize} teams` : scoring;
  });

  /**
   * A shared row only carries the stats its own player type has, so a column that is active for
   * skaters simply has no value on a goalie's row (and vice versa) — hence the widened lookup.
   */
  statValue(player: SharedPlayer, key: StatKey): number | null {
    const scoring: Record<string, number | undefined> = player.stats.scoring;
    return scoring[key] ?? null;
  }

  positionLabel(player: SharedPlayer): string {
    return player.type === 'goalie' ? 'G' : (player.positions?.join('/') ?? '');
  }
}
