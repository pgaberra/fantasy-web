import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlayerService } from '../services/player.service';
import { Player, ScoringStatKey, UtilityStatKey } from '../models/player.model';
import { ActiveColumns, PlayerProjection, ScoringType } from './model';
import { ScoringTypeSectionComponent } from './scoring-type-section/scoring-type-section';
import { ScoringStatsSectionComponent } from './scoring-stats-section/scoring-stats-section';
import { ProjectionSettingsSectionComponent } from './projection-settings-section/projection-settings-section';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { DEFAULT_DECIMAL_SETTINGS, DEFAULT_SCALE_SETTINGS, DecimalStatKey, ScaleConfig } from './projection-settings-section/model';

const DEFAULT_STAT_WEIGHTS: Record<ScoringStatKey, number> = {
  goals: 4.5,
  assists: 3,
  sog: 0.5,
  hits: 0.33,
  blocks: 0.5,
  gwg: 0.5,
  pim: 0.5,
  ppg: 0.5,
  ppa: 0.5,
  shg: 0.5,
  sha: 0.5,
  shPct: 0.5,
  fw: 0.5,
  fl: 0.5,
  plusMinus: 0.5,
};

@Component({
  selector: 'app-draft-projection',
  imports: [
    ScoringTypeSectionComponent,
    ScoringStatsSectionComponent,
    ProjectionSettingsSectionComponent,
    PlayerProjectionsTableComponent,
  ],
  templateUrl: './draft-projection.html',
  styleUrl: './draft-projection.css',
})
export class DraftProjectionComponent implements OnInit {
  private readonly playerService = inject(PlayerService);
  private readonly destroyRef = inject(DestroyRef);

  scoringType = signal<ScoringType>('points');
  playerProjections = signal<PlayerProjection[]>([]);
  statWeights = signal<Record<ScoringStatKey, number>>(DEFAULT_STAT_WEIGHTS);
  players = signal<Player[]>([]);

  activeScoringColumns = signal(
    new Set<ScoringStatKey>(['goals', 'assists', 'sog', 'hits', 'blocks']),
  );
  activeUtilityColumns = signal(new Set<UtilityStatKey>(['gp']));
  activeColumns = computed<ActiveColumns>(() => ({
    scoringColumns: this.activeScoringColumns(),
    utilityColumns: this.activeUtilityColumns(),
  }));
  scaleSettings = signal<Record<UtilityStatKey, ScaleConfig>>(DEFAULT_SCALE_SETTINGS);
  decimalSettings = signal<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  useDefaultDecimals = signal<boolean>(true);

  ngOnInit(): void {
    this.playerService
      .getPlayers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((players) => this.initializeProjection(players));
  }

  private initializeProjection(players: Player[]): void {
    const playerProjections: PlayerProjection[] = players.map((player) => ({
      playerId: player.id,
      stats: player.stats,
      fantasyPoints: 0,
      zScore: 0,
    }));

    this.players.set(players);
    this.playerProjections.set(playerProjections);
  }
}
