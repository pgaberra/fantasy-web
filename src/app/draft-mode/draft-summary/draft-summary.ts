import { Component, computed, inject, input, output } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { DraftTeam } from '../../api/models/draft-team';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar';

export interface DraftStandingPlayer {
  playerId: number;
  score: number;
}

export interface DraftStandingEntry {
  team: DraftTeam;
  players: DraftStandingPlayer[];
  total: number;
}

@Component({
  selector: 'app-draft-summary',
  imports: [PlayerAvatarComponent],
  templateUrl: './draft-summary.html',
  styleUrl: './draft-summary.css',
})
export class DraftSummaryComponent {
  readonly lookup = inject(DraftPlayerLookupService);

  readonly standings = input.required<DraftStandingEntry[]>();
  readonly scoringType = input.required<ScoringType>();
  readonly back = output<void>();

  readonly metricLabel = computed(() =>
    this.scoringType() === 'points' ? 'projected points' : 'projected Z-score',
  );

  format(value: number): string {
    return this.scoringType() === 'points' ? value.toFixed(1) : value.toFixed(2);
  }
}
