import { Component, computed, model } from '@angular/core';
import {
  GOALIE_SCORING_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  ScoringStatKey,
} from '../../models/stat-key.model';
import { StatGroupComponent } from './stat-group/stat-group';

@Component({
  selector: 'app-scoring-stats-section',
  templateUrl: './scoring-stats-section.html',
  styleUrl: './scoring-stats-section.css',
  imports: [StatGroupComponent],
})
export class ScoringStatsSectionComponent {
  activeScoringColumns = model.required<Set<ScoringStatKey>>();

  activeSkaterStats = computed(() =>
    SKATER_SCORING_STAT_KEYS.filter(key => this.activeScoringColumns().has(key))
  );

  activeGoalieStats = computed(() =>
    GOALIE_SCORING_STAT_KEYS.filter(key => this.activeScoringColumns().has(key))
  );

  availableSkaterStats = computed(() =>
    SKATER_SCORING_STAT_KEYS.filter(key => !this.activeScoringColumns().has(key))
  );

  availableGoalieStats = computed(() =>
    GOALIE_SCORING_STAT_KEYS.filter(key => !this.activeScoringColumns().has(key))
  );

  toggle(key: ScoringStatKey): void {
    this.activeScoringColumns.update(columns => {
      if (columns.has(key)) {
        columns.delete(key);
      } else {
        columns.add(key);
      }
      return new Set(columns);
    });
  }
}
