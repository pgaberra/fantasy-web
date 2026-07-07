import { Component, inject, input, signal } from '@angular/core';
import { DraftTeam } from '../../api/models/draft-team';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';

export interface DraftResultRoundPick {
  pickInRound: number;
  playerId: number;
  teamName: string;
  mine: boolean;
}

export interface DraftResultRound {
  round: number;
  picks: DraftResultRoundPick[];
}

export interface DraftResultTeamPick {
  overall: number;
  playerId: number;
}

export interface DraftResultTeam {
  team: DraftTeam;
  picks: DraftResultTeamPick[];
}

@Component({
  selector: 'app-draft-results',
  templateUrl: './draft-results.html',
  styleUrl: './draft-results.css',
})
export class DraftResultsComponent {
  readonly lookup = inject(DraftPlayerLookupService);

  readonly rounds = input.required<DraftResultRound[]>();
  readonly teams = input.required<DraftResultTeam[]>();

  readonly view = signal<'round' | 'team'>('round');
}
