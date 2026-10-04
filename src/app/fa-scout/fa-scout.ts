import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
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
import { FaScoutService } from '../services/fa-scout.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { StreamerPlannerLeagueService } from '../services/streamer-planner-league.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { HelpTipComponent } from '../shared/help-tip/help-tip';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { LeagueFieldComponent } from '../streamer-planner/league-field/league-field';
import { PLANNER_POSITIONS, PlannerPositionGroup } from '../streamer-planner/planner-free-agents';
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
 * <p>The league is the planner's, remembered once for both pages: a reader scouting a league for
 * keepers is the one streaming in it.
 */
@Component({
  selector: 'app-fa-scout',
  imports: [
    ErrorStateComponent,
    HelpTipComponent,
    IconComponent,
    LeagueFieldComponent,
    LoadingIndicatorComponent,
    ScoutTableComponent,
    TooltipDirective,
  ],
  templateUrl: './fa-scout.html',
  styleUrl: './fa-scout.css',
})
export class FaScoutComponent {
  private readonly scoutService = inject(FaScoutService);
  private readonly leagueService = inject(StreamerPlannerLeagueService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);

  readonly league = this.leagueService.league;

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

  readonly loading = computed(
    () => this.scoutResource.isLoading() || this.settingsResource.isLoading(),
  );
  readonly failure = computed(() => this.scoutResource.error() ?? this.settingsResource.error());

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

  /** Every available player of the kind on screen, best first on the rest of the season. */
  readonly ranked = computed<readonly ScoutRow[]>(() => {
    const list = this.list();
    if (!list) {
      return [];
    }
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
    return rankScout(list.players, this.kind(), rank, scoreOf);
  });

  readonly risingCount = computed(() => this.ranked().filter((row) => row.rising).length);

  readonly filtered = computed<readonly ScoutRow[]>(() => {
    const positions = this.positions();
    return this.ranked().filter(
      (row) =>
        (!this.risingOnly() || row.rising) &&
        (this.kind() === 'goalie' ||
          positions.size === 0 ||
          row.player.positions.some((position) => positions.has(position as PlannerPositionGroup))),
    );
  });

  readonly emptyText = computed(() => {
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
    source: () => [this.kind(), this.positions(), this.risingOnly(), this.league()],
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

  goToPage(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pageCount() - 1)));
  }
}
