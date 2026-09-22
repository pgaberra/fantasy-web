import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { DraftSettings } from '../../api/models/draft-settings';
import { DraftState } from '../../api/models/draft-state';
import { ProjectionData } from '../../api/models/projection-data';
import { Player } from '../../models/player.model';
import { applyPositionOverrides } from '../../models/position-override';
import { StatWeights } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { NotificationService } from '../../services/notification.service';
import { PlayerService } from '../../services/player.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { draftSettingsFromProjection } from '../../shared/league-settings/league-settings';
import { DEFAULT_ROSTER_SLOTS } from '../../draft-projection/projection-defaults';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { draftRankingInput } from '../draft-ranking';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { DraftSummaryComponent } from './draft-summary';
import {
  DraftBoard,
  draftLeagueProjection,
  draftResultRounds,
  draftResultTeams,
} from './draft-summary-data';

/**
 * A finished draft's summary, at an address of its own: the league projection its picks add up to,
 * and the picks themselves. It loads the draft rather than being handed one, so the summary opens
 * from a link, a reload or the board alike — the board is where picks are made, and nothing about
 * reading what a draft came to needs it.
 */
@Component({
  selector: 'app-draft-summary-page',
  imports: [RouterLink, LoadingIndicatorComponent, DraftSummaryComponent, IconComponent],
  providers: [DraftPlayerLookupService],
  templateUrl: './draft-summary-page.html',
  styleUrl: './draft-summary-page.css',
})
export class DraftSummaryPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly playerService = inject(PlayerService);
  private readonly notification = inject(NotificationService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly ranking = inject(ProjectionRankingService);
  readonly lookup = inject(DraftPlayerLookupService);

  readonly draftId = signal<string | null>(null);
  readonly draftName = signal<string>('');
  readonly loaded = signal<boolean>(false);
  readonly finished = signal<boolean>(false);

  private readonly data = signal<ProjectionData | null>(null);
  /** The league the draft is ranked by — its own, or the projection's on a draft saved before that. */
  private readonly league = signal<DraftSettings | null>(null);
  private readonly draft = signal<DraftState | null>(null);

  readonly exitLink = ['/draft'];

  readonly scoringType = computed(() => this.league()?.scoringType ?? 'points');
  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Total Points' : 'Z-Score',
  );
  private readonly statColumns = computed<ScoringStatKey[]>(
    () => (this.league()?.activeScoringColumns ?? []) as ScoringStatKey[],
  );
  private readonly statWeights = computed<StatWeights | null>(
    () => (this.league()?.statWeights as StatWeights | undefined) ?? null,
  );
  private readonly rosterSlots = computed(() => this.league()?.rosterSlots ?? DEFAULT_ROSTER_SLOTS);

  private readonly board = computed<DraftBoard>(() => {
    const draft = this.draft();
    return {
      teams: draft?.teams ?? [],
      order: draft?.order ?? [],
      picks: draft?.picks ?? [],
    };
  });

  private readonly rankingInput = computed(() => {
    const data = this.data();
    const league = this.league();
    return data && league ? draftRankingInput(data, league, this.serializer) : null;
  });

  private readonly ranked = computed(() => {
    const input = this.rankingInput();
    return input ? this.ranking.rankOverall(input) : [];
  });

  private readonly contributions = computed(() => {
    const input = this.rankingInput();
    return input
      ? this.ranking.contributionsByPlayerId(input)
      : new Map<number, Record<string, number>>();
  });

  readonly leagueProjection = computed(() =>
    draftLeagueProjection(
      this.board(),
      this.ranked(),
      this.contributions(),
      {
        statColumns: this.statColumns(),
        rosterSlots: this.rosterSlots(),
        scoringType: this.scoringType(),
        statWeights: this.statWeights(),
      },
      this.lookup,
    ),
  );

  readonly resultRounds = computed(() => draftResultRounds(this.board()));
  readonly resultTeams = computed(() => draftResultTeams(this.board()));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/draft']);
      return;
    }
    forkJoin({
      projection: this.projectionStorage.loadProjection(id),
      players: this.playerService.getPlayers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ projection, players }) => {
          // Only a draft has a summary. A board has no picks to total, and its own address is
          // the editor's.
          if (projection.kind !== 'draft') {
            void this.router.navigate(['/projections', projection.id], { replaceUrl: true });
            return;
          }
          this.draftId.set(projection.id);
          this.draftName.set(projection.name);
          this.data.set(projection.data);
          const state = this.serializer.fromProjectionData(projection.data);
          const pool: Player[] = applyPositionOverrides(players, state.positionOverrides);
          this.lookup.setPlayers(pool);
          this.draft.set(state.draft);
          this.finished.set(!!state.draft?.finishedAt);
          // A draft saved before drafts held a league is ranked by the projection's, exactly as
          // the board ranks it.
          this.league.set(
            state.draft?.settings ?? draftSettingsFromProjection(projection.data.settings),
          );
          this.loaded.set(true);
        },
        error: () => {
          this.notification.error("Couldn't load the draft. Please try again.");
          void this.router.navigate(['/draft']);
        },
      });
  }

  /** Back to the board, where the picks can be changed. */
  editDraft(): void {
    const id = this.draftId();
    void this.router.navigate(id ? ['/drafts', id] : ['/draft']);
  }
}
