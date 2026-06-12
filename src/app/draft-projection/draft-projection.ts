import { Component, computed, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { debounceTime, forkJoin } from 'rxjs';
import { PlayerService } from '../services/player.service';
import { Player } from '../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey, SCORING_STAT_KEYS } from '../models/stat-key.model';
import { ActiveColumns, Projection, ScoringType } from '../models/projection.model';
import { ProjectionSettingsSectionComponent } from './projection-settings-section/projection-settings-section';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from './projection-settings-section/model';
import { StatInfoService } from '../services/stat-info.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import {
  fromProjectionData,
  ProjectionState,
  toProjectionData,
} from '../services/projection-serializer';

const DEFAULT_STAT_WEIGHTS: Record<ScoringStatKey, number> = {
  goals: 4.5,
  assists: 3,
  points: 0,
  sog: 0.5,
  hits: 0.33,
  blocks: 0.5,
  gwg: 0.5,
  pim: 0.5,
  ppg: 0.5,
  ppa: 0.5,
  ppp: 0,
  shg: 0.5,
  sha: 0.5,
  shp: 0,
  shPct: 0.5,
  fw: 0.5,
  fl: 0.5,
  plusMinus: 0.5,
  gs: 0,
  w: 4,
  l: 0,
  sho: 3,
  sa: 0,
  sv: 0.2,
  ga: -1,
  gaa: 0,
  svPct: 0,
};

const AUTOSAVE_DEBOUNCE_MS = 1200;

@Component({
  selector: 'app-draft-projection',
  imports: [
    ProjectionSettingsSectionComponent,
    PlayerProjectionsTableComponent,
    LoadingIndicatorComponent,
    RouterLink,
  ],
  templateUrl: './draft-projection.html',
  styleUrl: './draft-projection.css',
})
export class DraftProjectionComponent implements OnInit {
  private readonly playerService = inject(PlayerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statInfoService = inject(StatInfoService);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly table = viewChild(PlayerProjectionsTableComponent);

  readonly projectionName = signal<string>('');
  readonly saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  readonly loadedProjections = signal<Projection[] | null>(null);
  private readonly projectionId = signal<string | null>(null);
  private readonly autosaveEnabled = signal<boolean>(false);
  private lastSavedJson = '';

  scoringType = signal<ScoringType>('points');
  statWeights = signal<Record<ScoringStatKey, number>>(DEFAULT_STAT_WEIGHTS);
  players = signal<Player[]>([]);

  activeScoringColumns = signal(
    new Set<ScoringStatKey>(['goals', 'assists', 'sog', 'hits', 'blocks', 'gaa', 'svPct', 'w']),
  );
  activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(['gp']));
  activeColumns = computed<ActiveColumns>(() => ({
    scoring: this.activeScoringColumns(),
    utility: this.activeUtilityColumns(),
  }));
  scaleSettings = signal<Record<SkaterUtilityStatKey, ScaleConfig>>(
    this.createDefaultScaleSettings(),
  );
  decimalSettings = signal<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  useDefaultDecimals = signal<boolean>(true);

  isLoading = signal<boolean>(true);

  private readonly serializedState = computed(() =>
    this.autosaveEnabled() ? JSON.stringify(toProjectionData(this.buildState())) : '',
  );

  constructor() {
    toObservable(this.serializedState)
      .pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.autosave());
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.openExisting(id);
      return;
    }

    const name = (history.state as { name?: string }).name?.trim();
    if (!name) {
      void this.router.navigate(['/projections']);
      return;
    }
    this.createNew(name);
  }

  private openExisting(id: string): void {
    forkJoin({
      skaters: this.playerService.getSkaters(),
      goalies: this.playerService.getGoalies(),
      projection: this.projectionStorage.loadProjection(id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ skaters, goalies, projection }) => {
          this.players.set([...skaters, ...goalies]);
          this.projectionId.set(projection.id);
          this.projectionName.set(projection.name);
          const state = fromProjectionData(projection.data);
          this.applyState(state);
          this.lastSavedJson = JSON.stringify(toProjectionData(state));
          this.isLoading.set(false);
          this.autosaveEnabled.set(true);
        },
        error: () => this.router.navigate(['/projections']),
      });
  }

  private createNew(name: string): void {
    this.projectionName.set(name);
    forkJoin({
      skaters: this.playerService.getSkaters(),
      goalies: this.playerService.getGoalies(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ skaters, goalies }) => {
          const players = [...skaters, ...goalies];
          this.players.set(players);
          this.loadedProjections.set(this.buildDefaultProjections(players));
          const data = toProjectionData(this.buildState());
          this.projectionStorage
            .createProjection({ name, data })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (projection) => {
                this.projectionId.set(projection.id);
                this.lastSavedJson = JSON.stringify(data);
                this.location.replaceState(`/projections/${projection.id}`);
                this.isLoading.set(false);
                this.autosaveEnabled.set(true);
              },
              error: () => this.router.navigate(['/projections']),
            });
        },
        error: () => this.router.navigate(['/projections']),
      });
  }

  private buildDefaultProjections(players: Player[]): Projection[] {
    return players.map((player) =>
      player.type === 'skater'
        ? { type: 'skater', playerId: player.id, stats: player.stats }
        : { type: 'goalie', playerId: player.id, stats: player.stats },
    );
  }

  private buildState(): ProjectionState {
    return {
      scoringType: this.scoringType(),
      statWeights: this.statWeights(),
      activeScoringColumns: this.activeScoringColumns(),
      activeUtilityColumns: this.activeUtilityColumns(),
      scaleSettings: this.scaleSettings(),
      decimalSettings: this.decimalSettings(),
      useDefaultDecimals: this.useDefaultDecimals(),
      playerProjections: this.table()?.playerProjections?.() ?? this.loadedProjections() ?? [],
    };
  }

  private applyState(state: ProjectionState): void {
    this.scoringType.set(state.scoringType);
    this.statWeights.set(state.statWeights);
    this.activeScoringColumns.set(state.activeScoringColumns);
    this.activeUtilityColumns.set(state.activeUtilityColumns);
    this.scaleSettings.set(state.scaleSettings);
    this.decimalSettings.set(state.decimalSettings);
    this.useDefaultDecimals.set(state.useDefaultDecimals);
    this.loadedProjections.set(state.playerProjections);
  }

  private autosave(): void {
    const id = this.projectionId();
    if (!this.autosaveEnabled() || !id) {
      return;
    }
    const data = toProjectionData(this.buildState());
    const json = JSON.stringify(data);
    if (json === this.lastSavedJson) {
      return;
    }
    this.lastSavedJson = json;
    this.saveStatus.set('saving');
    this.projectionStorage
      .updateProjection(id, { name: this.projectionName(), data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saveStatus.set('saved'),
        error: () => this.saveStatus.set('idle'),
      });
  }

  private createDefaultScaleSettings(): Record<SkaterUtilityStatKey, ScaleConfig> {
    const scalableStats = new Set<ScoringStatKey>(
      SCORING_STAT_KEYS.filter((k) => !this.statInfoService.isRateStat(k)),
    );
    return {
      gp: { scale: true, scalableStats },
      toiPerGame: { scale: true, scalableStats },
    };
  }
}
