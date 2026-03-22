import { Component, model } from '@angular/core';
import { SCORING_STAT_KEYS, ScoringStatKey } from '../../models/player.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';

@Component({
  selector: 'app-scoring-stats-section',
  templateUrl: './scoring-stats-section.html',
  styleUrl: './scoring-stats-section.css',
  imports: [StatLabelPipe],
})
export class ScoringStatsSectionComponent {
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
