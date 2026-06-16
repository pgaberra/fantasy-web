import { Component, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
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
import { ScoringType } from '../../models/projection.model';
import { DEFAULT_LEAGUE_SIZE, DEFAULT_ROSTER_SLOTS } from '../projection-defaults';
import { RosterSlots } from '../../api/models/roster-slots';
import { StatGroupComponent } from './stat-group/stat-group';
import { StatInfoService } from '../../services/stat-info.service';

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
    StatGroupComponent,
  ],
})
export class ProjectionSettingsSectionComponent {
  private readonly statInfoService = inject(StatInfoService);

  scoringType = model.required<ScoringType>();
  activeUtilityColumns = model.required<Set<UtilityStatKey>>();
  activeScoringColumns = model.required<Set<ScoringStatKey>>();
  activeScoringColumnsSorted = computed(() => {
    return Array.from(this.activeScoringColumns()).sort(
      (a, b) => SCORING_STAT_KEYS.indexOf(a) - SCORING_STAT_KEYS.indexOf(b),
    );
  });

  activeSkaterStats = computed(() =>
    SKATER_SCORING_STAT_KEYS.filter((key) => this.activeScoringColumns().has(key)),
  );
  activeGoalieStats = computed(() =>
    GOALIE_SCORING_STAT_KEYS.filter((key) => this.activeScoringColumns().has(key)),
  );
  availableSkaterStats = computed(() =>
    SKATER_SCORING_STAT_KEYS.filter((key) => !this.activeScoringColumns().has(key)),
  );
  availableGoalieStats = computed(() =>
    GOALIE_SCORING_STAT_KEYS.filter((key) => !this.activeScoringColumns().has(key)),
  );

  scaleSettings = model.required<Record<UtilityStatKey, ScaleConfig>>();
  useDefaultDecimals = model<boolean>(true);
  leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly rosterSummary = computed(() => {
    const slots = this.rosterSlots();
    return {
      skaters: slots.c + slots.lw + slots.rw + slots.d + slots.util + slots.bn,
      goalies: slots.g,
    };
  });
  protected readonly ROSTER_POSITIONS: { key: keyof RosterSlots; label: string }[] = [
    { key: 'c', label: 'C' },
    { key: 'lw', label: 'LW' },
    { key: 'rw', label: 'RW' },
    { key: 'd', label: 'D' },
    { key: 'util', label: 'Util' },
    { key: 'bn', label: 'BN' },
    { key: 'g', label: 'G' },
  ];
  showDecimalsSetting = input<boolean>(true);
  showUtilityStats = input<boolean>(true);
  initiallyExpanded = input<boolean>(false);
  collapsibleGroups = input<boolean>(true);
  isSectionVisible = linkedSignal(() => this.initiallyExpanded());
  isGeneralVisible = signal<boolean>(false);
  isScoringStatsVisible = signal<boolean>(false);
  isUtilityStatsVisible = signal<boolean>(false);
  readonly isGeneralExpanded = computed(() => !this.collapsibleGroups() || this.isGeneralVisible());
  readonly isScoringStatsExpanded = computed(
    () => !this.collapsibleGroups() || this.isScoringStatsVisible(),
  );
  private readonly showAdvancedScaleOptions = signal<Record<UtilityStatKey, boolean>>({
    gp: false,
    toiPerGame: false,
  });

  toggleSectionVisible(): void {
    this.isSectionVisible.update((visible) => !visible);
  }

  selectScoringType(type: ScoringType): void {
    this.scoringType.set(type);
  }

  onLeagueSizeInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.leagueSize.set(Math.min(30, Math.max(2, Math.round(parsed))));
    }
  }

  onRosterSlotInput(position: keyof RosterSlots, event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(50, Math.max(0, Math.round(parsed)));
      this.rosterSlots.update((slots) => ({ ...slots, [position]: clamped }));
    }
  }

  toggleGeneralVisible(): void {
    this.isGeneralVisible.update((visible) => !visible);
  }

  toggleScoringStatsVisible(): void {
    this.isScoringStatsVisible.update((visible) => !visible);
  }

  toggleUtilityStatsVisible(): void {
    this.isUtilityStatsVisible.update((visible) => !visible);
  }

  toggleStat(key: ScoringStatKey): void {
    this.activeScoringColumns.update((columns) => {
      if (columns.has(key)) {
        columns.delete(key);
      } else {
        columns.add(key);
      }
      return new Set(columns);
    });
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
    const active = this.activeScoringColumnsSorted().filter(
      (scoringKey) => !this.statInfoService.isRateStat(scoringKey),
    );
    if (
      (GOALIE_UTILITY_STAT_KEYS as readonly string[]).includes(key) &&
      (SKATER_UTILITY_STAT_KEYS as readonly string[]).includes(key)
    ) {
      return active;
    }

    if ((GOALIE_UTILITY_STAT_KEYS as readonly string[]).includes(key)) {
      return active.filter((scoringKey) =>
        (GOALIE_SCORING_STAT_KEYS as readonly string[]).includes(scoringKey),
      );
    }

    return active.filter((scoringKey) =>
      (SKATER_SCORING_STAT_KEYS as readonly string[]).includes(scoringKey),
    );
  }

  protected readonly UTILITY_STAT_KEYS = UTILITY_STAT_KEYS;
}
