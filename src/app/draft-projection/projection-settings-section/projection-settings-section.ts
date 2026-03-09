import { Component, computed, model, signal } from '@angular/core';
import { UtilityStatLabelPipe } from '../../pipes/utility-stat-label.pipe';
import { StatDescPipe } from '../../pipes/stat-desc.pipe';
import { UTILITY_STAT_KEYS, UtilityStatKey } from '../../models/player.model';

@Component({
  selector: 'app-projection-settings-section',
  templateUrl: './projection-settings-section.html',
  styleUrl: './projection-settings-section.css',
  imports: [UtilityStatLabelPipe, StatDescPipe],
})
export class ProjectionSettingsSectionComponent {
  readonly ALL_UTILITY_STAT_KEYS = signal<Set<UtilityStatKey>>(new Set(UTILITY_STAT_KEYS));
  activeUtilityColumns = model.required<Set<UtilityStatKey>>();
  toggle(key: UtilityStatKey): void {
    this.activeUtilityColumns.update((columns) => {
      if (columns.has(key)) {
        columns.delete(key);
      } else {
        columns.add(key);
      }
      return new Set(columns);
    });
  }
}
