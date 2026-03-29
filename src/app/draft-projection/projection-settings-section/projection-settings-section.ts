import { Component, computed, input, model, signal } from '@angular/core';
import { SettingRowComponent } from './setting-row/setting-row';
import { ToggleSwitchComponent } from './toggle-switch/toggle-switch';
import { UtilityStatLabelPipe } from '../../pipes/utility-stat-label.pipe';
import { StatDescPipe } from '../../pipes/stat-desc.pipe';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  UTILITY_STAT_KEYS,
  UtilityStatKey,
} from '../../models/stat-key.model';
import { ScaleConfig } from './model';

@Component({
  selector: 'app-projection-settings-section',
  templateUrl: './projection-settings-section.html',
  styleUrl: './projection-settings-section.css',
  imports: [
    UtilityStatLabelPipe,
    StatDescPipe,
    StatLabelPipe,
    ToggleSwitchComponent,
    SettingRowComponent,
  ],
})
export class ProjectionSettingsSectionComponent {
  activeUtilityColumns = model.required<Set<UtilityStatKey>>();
  activeScoringColumns = input.required<Set<ScoringStatKey>>();
  activeScoringColumnsSorted = computed(() => {
    return Array.from(this.activeScoringColumns()).sort(
      (a, b) => SCORING_STAT_KEYS.indexOf(a) - SCORING_STAT_KEYS.indexOf(b),
    );
  });

  scaleSettings = model.required<Record<UtilityStatKey, ScaleConfig>>();
  useDefaultDecimals = model<boolean>(true);
  isGeneralVisible = signal<boolean>(true);
  isUtilityStatsVisible = signal<boolean>(true);
  private readonly showAdvancedScaleOptions = signal<Record<UtilityStatKey, boolean>>({
    gp: false,
    toiPerGame: false,
  });

  toggleGeneralVisible(): void {
    this.isGeneralVisible.update((visible) => !visible);
  }

  toggleUtilityStatsVisible(): void {
    this.isUtilityStatsVisible.update((visible) => !visible);
  }

  toggleActiveUtilityColumn(key: UtilityStatKey): void {
    this.activeUtilityColumns.update((columns) => {
      if (columns.has(key)) {
        columns.delete(key);
      } else {
        columns.add(key);
      }
      return new Set(columns);
    });
  }

  toggleScale(key: UtilityStatKey): void {
    this.scaleSettings.update((settings) => ({
      ...settings,
      [key]: { ...settings[key], scale: !settings[key].scale },
    }));
  }

  isScaleActive(key: UtilityStatKey): boolean {
    return this.scaleSettings()[key].scale;
  }

  toggleScaleStat(statKey: ScoringStatKey, utilityKey: UtilityStatKey): void {
    this.scaleSettings.update((settings) => {
      const scalableStats = new Set(settings[utilityKey].scalableStats);
      if (scalableStats.has(statKey)) {
        scalableStats.delete(statKey);
      } else {
        scalableStats.add(statKey);
      }
      return { ...settings, [utilityKey]: { ...settings[utilityKey], scalableStats } };
    });
  }

  toggleUseDefaultDecimals(): void {
    this.useDefaultDecimals.update((show) => !show);
  }

  isScaleStatActive(statKey: ScoringStatKey, utilityKey: UtilityStatKey): boolean {
    return this.scaleSettings()[utilityKey].scalableStats.has(statKey);
  }

  toggleAdvanced(utilityKey: UtilityStatKey): void {
    this.showAdvancedScaleOptions.update((opts) => ({ ...opts, [utilityKey]: !opts[utilityKey] }));
  }

  isAdvancedVisible(utilityKey: UtilityStatKey): boolean {
    return this.showAdvancedScaleOptions()[utilityKey];
  }

  getAvailableScoringStats(key: UtilityStatKey): ScoringStatKey[] {
    const active = this.activeScoringColumnsSorted();
    if (
      (GOALIE_UTILITY_STAT_KEYS as readonly string[]).includes(key) &&
      (SKATER_UTILITY_STAT_KEYS as readonly string[]).includes(key)
    ) {
      return active;
    }

    if ((GOALIE_UTILITY_STAT_KEYS as readonly string[]).includes(key)) {
      return active.filter((scoringKey) =>
        (GOALIE_SCORING_STAT_KEYS as readonly string[]).includes(scoringKey));
    }
    
    return active.filter((scoringKey) =>
      (SKATER_SCORING_STAT_KEYS as readonly string[]).includes(scoringKey));
  }

  protected readonly UTILITY_STAT_KEYS = UTILITY_STAT_KEYS;
}
