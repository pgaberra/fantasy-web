import { Component, model } from '@angular/core';
import { SCORING_STAT_KEYS, ScoringStatKey } from '../../models/player.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';

@Component({
  selector: 'app-league-stats-section',
  templateUrl: './league-stats-section.html',
  styleUrl: './league-stats-section.css',
  imports: [StatLabelPipe],
})
export class LeagueStatsSectionComponent {
  activeScoringColumns = model.required<Set<ScoringStatKey>>();

  toggle(key: ScoringStatKey): void {
    this.activeScoringColumns.update((columns) => {
      if (columns.has(key)) {
        columns.delete(key);
      } else {
        columns.add(key);
      }
      return new Set(columns);
    });
  }

  protected readonly SCORING_STAT_KEYS = SCORING_STAT_KEYS;
}
