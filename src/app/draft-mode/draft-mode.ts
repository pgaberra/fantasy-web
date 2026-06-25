import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { Player } from '../models/player.model';
import { Projection, ScoredProjection, StatWeights } from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { DraftPick } from '../api/models/draft-pick';
import { ProjectionData } from '../api/models/projection-data';
import { fromProjectionData } from '../services/projection-serializer';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { deriveRoster } from './draft-roster';

@Component({
  selector: 'app-draft-mode',
  imports: [RouterLink, LoadingIndicatorComponent],
  templateUrl: './draft-mode.html',
  styleUrl: './draft-mode.css',
})
export class DraftModeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly playerService = inject(PlayerService);
  private readonly ranking = inject(ProjectionRankingService);

  readonly projectionId = signal<string | null>(null);
  readonly projectionName = signal<string>('');
  readonly loaded = signal<boolean>(false);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  readonly searchTerm = signal<string>('');

  private readonly data = signal<ProjectionData | null>(null);
  private readonly allPlayers = signal<Player[]>([]);
  readonly picks = signal<DraftPick[]>([]);

  readonly playerMap = computed(
    () => new Map(this.allPlayers().map((player) => [player.id, player])),
  );

  private readonly projections = computed<Projection[]>(() => {
    const data = this.data();
    return data ? fromProjectionData(data).playerProjections : [];
  });

  private readonly scoringType = computed(() => this.data()?.settings.scoringType ?? 'points');
  private readonly rosterSlots = computed(
    () => this.data()?.settings.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
  );
  private readonly draftedIds = computed(() => new Set(this.picks().map((pick) => pick.playerId)));
  private readonly minePicks = computed(() =>
    this.picks()
      .filter((pick) => pick.by === 'me')
      .map((pick) => pick.playerId),
  );

  private readonly ranked = computed<ScoredProjection[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const settings = data.settings;
    return this.ranking.rankOverall({
      projections: this.projections(),
      scoringType: settings.scoringType,
      statWeights: settings.statWeights as StatWeights,
      activeScoringColumns: new Set(settings.activeScoringColumns as ScoringStatKey[]),
      leagueSize: settings.leagueSize ?? DEFAULT_LEAGUE_SIZE,
      rosterSlots: settings.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
      minGoalieGames: settings.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES,
      decimalSettings: settings.decimalSettings,
    });
  });

  readonly available = computed<ScoredProjection[]>(() => {
    const drafted = this.draftedIds();
    const term = this.searchTerm().trim().toLowerCase();
    const players = this.playerMap();
    return this.ranked().filter((scoredProjection) => {
      if (drafted.has(scoredProjection.projection.playerId)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return players.get(scoredProjection.projection.playerId)?.name.toLowerCase().includes(term);
    });
  });

  readonly roster = computed(() =>
    deriveRoster(this.minePicks(), this.playerMap(), this.rosterSlots()),
  );
  readonly filledCount = computed(
    () => this.roster().slots.filter((slot) => slot.playerId !== null).length,
  );
  readonly totalSlots = computed(() => this.roster().slots.length);
  readonly takenCount = computed(() => this.picks().filter((pick) => pick.by === 'others').length);
  readonly canUndo = computed(() => this.picks().length > 0);

  ngOnInit(): void {
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
          this.projectionId.set(projection.id);
          this.projectionName.set(projection.name);
          this.data.set(projection.data);
          this.allPlayers.set(players);
          this.picks.set(projection.data.draft?.picks ?? []);
          this.loaded.set(true);
        },
        error: () => void this.router.navigate(['/projections']),
      });
  }

  draftMine(playerId: number): void {
    this.addPick(playerId, 'me');
  }

  markTaken(playerId: number): void {
    this.addPick(playerId, 'others');
  }

  release(playerId: number): void {
    this.picks.update((picks) => picks.filter((pick) => pick.playerId !== playerId));
    this.save();
  }

  undoLast(): void {
    this.picks.update((picks) => picks.slice(0, -1));
    this.save();
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  playerName(playerId: number): string {
    return this.playerMap().get(playerId)?.name ?? '';
  }

  playerTeam(playerId: number): string {
    return this.playerMap().get(playerId)?.teamAbbrev ?? '';
  }

  playerPositions(playerId: number): string {
    const player = this.playerMap().get(playerId);
    if (!player) {
      return '';
    }
    return player.type === 'goalie' ? 'G' : [...player.positions].join('/');
  }

  scoreLabel(scoredProjection: ScoredProjection): string {
    return this.scoringType() === 'points'
      ? scoredProjection.score.fantasyPoints.toFixed(1)
      : scoredProjection.score.zScore.toFixed(2);
  }

  private addPick(playerId: number, by: DraftPick['by']): void {
    this.picks.update((picks) => [...picks, { playerId, by }]);
    this.save();
  }

  private save(): void {
    const id = this.projectionId();
    const data = this.data();
    if (!id || !data) {
      return;
    }
    const picks = this.picks();
    const updated: ProjectionData = {
      ...data,
      draft: picks.length ? { picks } : undefined,
    };
    this.saveStatus.set('saving');
    this.projectionStorage
      .updateProjection(id, { name: this.projectionName(), data: updated })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saveStatus.set('saved'),
        error: () => this.saveStatus.set('idle'),
      });
  }
}
