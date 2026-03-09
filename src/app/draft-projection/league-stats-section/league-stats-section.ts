import { Component, model, signal } from '@angular/core';
import { SCORING_STAT_KEYS, ScoringStatKey } from '../../models/player.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';

@Component({
  selector: 'app-league-stats-section',
  templateUrl: './league-stats-section.html',
  styleUrl: './league-stats-section.css',
  imports: [StatLabelPipe],
})
export class LeagueStatsSectionComponent {
  readonly ALL_SCORING_STAT_KEYS = signal<Set<ScoringStatKey>>(
    new Set(SCORING_STAT_KEYS),
  ).asReadonly();
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
}
