import { Component, computed, input, output, signal } from '@angular/core';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  StatKey,
  UTILITY_STAT_KEYS,
  UtilityStatKey,
} from '../../../models/stat-key.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { STAT_FULL_NAMES } from '../../../pipes/stat-tooltip.pipe';

export type StatGroup = 'skater' | 'goalie' | 'utility';

export interface StatOption {
  statKey: StatKey;
  isUtility: boolean;
}

const GROUP_LABELS: Record<StatGroup, string> = {
  skater: 'Skater',
  goalie: 'Goalie',
  utility: 'Utility',
};

/**
 * Which stats the projection carries — labelled **Stats** in the toolbar, because ticking one is
 * not a display choice: `activeScoringColumns` is what the scoring and the ranking are computed
 * over. The counterpart to removing a column from its own header menu — it picks what to add,
 * grouped the way the settings panel it replaces grouped it, and deliberately stays open while
 * several are ticked, since adding one stat per dropdown round-trip was the slowest part of the
 * old panel.
 *
 * How a column's numbers are formatted is not here: decimals belong to the column they format, and
 * live in that column's own menu.
 */
@Component({
  selector: 'app-columns-menu',
  templateUrl: './columns-menu.html',
  styleUrl: './columns-menu.css',
  imports: [StatLabelPipe],
})
export class ColumnsMenuComponent {
  readonly activeScoringColumns = input.required<Set<ScoringStatKey>>();
  readonly activeUtilityColumns = input.required<Set<UtilityStatKey>>();

  readonly scoringToggled = output<ScoringStatKey>();
  readonly utilityToggled = output<UtilityStatKey>();

  readonly group = signal<StatGroup>('skater');
  readonly searchTerm = signal('');

  readonly groups: StatGroup[] = ['skater', 'goalie', 'utility'];

  private readonly optionsInGroup = computed<StatOption[]>(() => {
    switch (this.group()) {
      case 'skater':
        return SKATER_SCORING_STAT_KEYS.map((statKey) => ({ statKey, isUtility: false }));
      case 'goalie':
        return GOALIE_SCORING_STAT_KEYS.map((statKey) => ({ statKey, isUtility: false }));
      case 'utility':
        return UTILITY_STAT_KEYS.map((statKey) => ({ statKey, isUtility: true }));
    }
  });

  readonly visibleOptions = computed<StatOption[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.optionsInGroup();
    }
    return this.optionsInGroup().filter((option) =>
      this.fullNameOf(option).toLowerCase().includes(term),
    );
  });

  fullNameOf(option: StatOption): string {
    return STAT_FULL_NAMES[option.statKey];
  }

  isActive(option: StatOption): boolean {
    return option.isUtility
      ? this.activeUtilityColumns().has(option.statKey as UtilityStatKey)
      : this.activeScoringColumns().has(option.statKey as ScoringStatKey);
  }

  toggle(option: StatOption): void {
    if (option.isUtility) {
      this.utilityToggled.emit(option.statKey as UtilityStatKey);
    } else {
      this.scoringToggled.emit(option.statKey as ScoringStatKey);
    }
  }

  selectGroup(group: StatGroup): void {
    this.group.set(group);
    this.searchTerm.set('');
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  labelFor(group: StatGroup): string {
    return GROUP_LABELS[group];
  }
}
