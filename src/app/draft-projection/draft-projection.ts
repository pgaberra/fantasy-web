import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { PlayerService } from '../services/player.service';
import { Player } from '../models/player.model';
import { ScoringStatKey, SkaterUtilityStatKey, SCORING_STAT_KEYS } from '../models/stat-key.model';
import { ActiveColumns, ScoringType } from '../models/projection.model';
import { ProjectionSettingsSectionComponent } from './projection-settings-section/projection-settings-section';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from './projection-settings-section/model';
import { StatInfoService } from '../services/stat-info.service';

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

@Component({
  selector: 'app-draft-projection',
  imports: [
    ProjectionSettingsSectionComponent,
    PlayerProjectionsTableComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: './draft-projection.html',
  styleUrl: './draft-projection.css',
})
export class DraftProjectionComponent implements OnInit {
  private readonly playerService = inject(PlayerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statInfoService = inject(StatInfoService);

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

  ngOnInit(): void {
    forkJoin({
      skaters: this.playerService.getSkaters(),
      goalies: this.playerService.getGoalies(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ skaters, goalies }) => {
          this.players.set([...skaters, ...goalies]);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
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
