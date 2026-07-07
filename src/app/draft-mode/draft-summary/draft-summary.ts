import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { DraftTeam } from '../../api/models/draft-team';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar';
import {
  DraftResultRound,
  DraftResultTeam,
  DraftResultsComponent,
} from '../draft-results/draft-results';

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
  imports: [PlayerAvatarComponent, DraftResultsComponent],
  templateUrl: './draft-summary.html',
  styleUrl: './draft-summary.css',
})
export class DraftSummaryComponent {
  readonly lookup = inject(DraftPlayerLookupService);

  readonly standings = input.required<DraftStandingEntry[]>();
  readonly scoringType = input.required<ScoringType>();
  readonly resultRounds = input.required<DraftResultRound[]>();
  readonly resultTeams = input.required<DraftResultTeam[]>();
  readonly back = output<void>();

  readonly activeTab = signal<'projection' | 'results'>('projection');

  readonly metricLabel = computed(() =>
    this.scoringType() === 'points' ? 'projected points' : 'projected Z-score',
  );

  format(value: number): string {
    return this.scoringType() === 'points' ? value.toFixed(1) : value.toFixed(2);
  }
}
