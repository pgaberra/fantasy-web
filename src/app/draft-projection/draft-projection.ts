import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlayerService } from '../services/player.service';
import { Player, SCORING_STAT_KEYS, ScoringStatKey, UtilityStatKey } from '../models/player.model';
import { PlayerProjection, Projection, ScoringType } from './model';
import { ScoringTypeSectionComponent } from './scoring-type-section/scoring-type-section';
import { LeagueStatsSectionComponent } from './league-stats-section/league-stats-section';
import { ProjectionSettingsSectionComponent } from './projection-settings-section/projection-settings-section';
import {
  PlayerProjectionsTableComponent,
} from './player-projections-table/player-projections-table';
import { StatUpdateEvent, WeightUpdateEvent } from './player-projections-table/model';

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
  plusMinus: 0.5
};

@Component({
  selector: 'app-draft-projection',
  imports: [
    ScoringTypeSectionComponent,
    LeagueStatsSectionComponent,
    ProjectionSettingsSectionComponent,
    PlayerProjectionsTableComponent,
  ],
  templateUrl: './draft-projection.html',
  styleUrl: './draft-projection.css',
})
export class DraftProjectionComponent implements OnInit {
  private readonly playerService = inject(PlayerService);
  private readonly destroyRef = inject(DestroyRef);

  projection = signal<Projection | undefined>(undefined);
  players = signal<Player[]>([]);

  activeScoringColumns = signal(new Set<ScoringStatKey>(['goals', 'assists', 'sog', 'hits', 'blocks']));
  activeUtilityColumns = signal(new Set<UtilityStatKey>(['gp', 'toiPerGame']));

  ngOnInit(): void {
    this.playerService
      .getPlayers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((players) => this.initializeProjection(players));
  }

  private initializeProjection(players: Player[]): void {
    const playerProjections: PlayerProjection[] = players.map((player) => {
      return {
        playerId: player.id,
        stats: {
          scoring: player.stats.scoring,
          utility: player.stats.utility,
        },
        fantasyPoints: 0,
        zScore: 0
      };
    });

    this.players.set(players);
    this.projection.set({
      scoringType: 'points',
      playerProjections,
      statWeights: DEFAULT_STAT_WEIGHTS,
    });
  }

  onScoringTypeChange(scoringType: ScoringType): void {
    this.projection.update((projection) => {
      if (!projection) return projection;
      return { ...projection, scoringType };
    });
  }

  onStatUpdated(event: StatUpdateEvent): void {
    this.projection.update((projection) => {
      if (!projection) return projection;
      const playerProjections = projection.playerProjections.map((pp) => {
        if (pp.playerId !== event.playerId) return pp;
        const isScoring = (SCORING_STAT_KEYS as readonly string[]).includes(event.key);
        const stats = isScoring
          ? { ...pp.stats, scoring: { ...pp.stats.scoring, [event.key]: event.value } }
          : { ...pp.stats, utility: { ...pp.stats.utility, [event.key]: event.value } };
        return { ...pp, stats };
      });
      return { ...projection, playerProjections };
    });
  }

  onWeightUpdated(event: WeightUpdateEvent): void {
    this.projection.update((projection) => {
      if (!projection) return projection;
      const statWeights = { ...projection.statWeights, [event.key]: event.value };
      return { ...projection, statWeights };
    });
  }
}
