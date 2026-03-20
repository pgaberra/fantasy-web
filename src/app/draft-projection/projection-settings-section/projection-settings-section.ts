import { Component, input, model, signal } from '@angular/core';
import { SettingRowComponent } from './setting-row/setting-row';
import { ToggleSwitchComponent } from './toggle-switch/toggle-switch';
import { UtilityStatLabelPipe } from '../../pipes/utility-stat-label.pipe';
import { StatDescPipe } from '../../pipes/stat-desc.pipe';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { ScoringStatKey, UTILITY_STAT_KEYS, UtilityStatKey } from '../../models/player.model';
import { ScaleConfig } from './model';

@Component({
  selector: 'app-projection-settings-section',
  templateUrl: './projection-settings-section.html',
  styleUrl: './projection-settings-section.css',
  imports: [UtilityStatLabelPipe, StatDescPipe, StatLabelPipe, ToggleSwitchComponent, SettingRowComponent],
})
export class ProjectionSettingsSectionComponent {
  activeUtilityColumns = model.required<Set<UtilityStatKey>>();
  activeScoringColumns = input.required<Set<ScoringStatKey>>();

  scaleSettings = model.required<Record<UtilityStatKey, ScaleConfig>>();
  showDecimalRow = model<boolean>(false);
  private readonly showAdvancedScaleOptions = signal<Record<UtilityStatKey, boolean>>({
    gp: false,
    toiPerGame: false,
  });

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

  toggleShowDecimalRow(): void {
    this.showDecimalRow.update((show) => !show);
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

  protected readonly UTILITY_STAT_KEYS = UTILITY_STAT_KEYS;
}
