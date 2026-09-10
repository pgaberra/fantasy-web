import { Component, input, output, signal } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { LeagueProjectionData } from '../league-projection';
import { LeagueProjectionTableComponent } from '../league-projection-table/league-projection-table';
import { IconComponent } from '../../shared/icon/icon';
import {
  DraftResultRound,
  DraftResultTeam,
  DraftResultsComponent,
} from '../draft-results/draft-results';

@Component({
  selector: 'app-draft-summary',
  imports: [LeagueProjectionTableComponent, DraftResultsComponent, IconComponent],
  templateUrl: './draft-summary.html',
  styleUrl: './draft-summary.css',
})
export class DraftSummaryComponent {
  readonly leagueProjection = input.required<LeagueProjectionData>();
  readonly scoringType = input.required<ScoringType>();
  readonly scoreHeading = input.required<string>();
  readonly resultRounds = input.required<DraftResultRound[]>();
  readonly resultTeams = input.required<DraftResultTeam[]>();
  readonly back = output<void>();

  readonly activeTab = signal<'projection' | 'results'>('projection');
}
