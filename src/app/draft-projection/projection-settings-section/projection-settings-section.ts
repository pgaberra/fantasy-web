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
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  FULL_SEASON_GAMES,
} from '../projection-defaults';
import { RosterSlots } from '../../api/models/roster-slots';
import { StatGroupComponent } from './stat-group/stat-group';
import { CategorySettingsComponent } from './category-settings/category-settings';
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
    CategorySettingsComponent,
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
  minGoalieGames = model<number>(DEFAULT_MIN_GOALIE_GAMES);
  showDecimalsSetting = input<boolean>(true);
  showUtilityStats = input<boolean>(true);
  initiallyExpanded = input<boolean>(true);
  collapsibleGroups = input<boolean>(true);
  isSectionVisible = linkedSignal(() => this.initiallyExpanded());
  // Collapsed by default so the Yahoo sync — which fills these in for you — leads, and the
  // manual controls stay one click away rather than dominating the section.
  isLeagueSettingsVisible = signal<boolean>(false);
  isUtilityStatsVisible = signal<boolean>(false);
  isAdditionalSettingsVisible = signal<boolean>(false);
  readonly isLeagueSettingsExpanded = computed(
    () => !this.collapsibleGroups() || this.isLeagueSettingsVisible(),
  );
  readonly isAdditionalSettingsExpanded = computed(
    () => !this.collapsibleGroups() || this.isAdditionalSettingsVisible(),
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

  toggleLeagueSettingsVisible(): void {
    this.isLeagueSettingsVisible.update((visible) => !visible);
  }

  toggleUtilityStatsVisible(): void {
    this.isUtilityStatsVisible.update((visible) => !visible);
  }

  toggleAdditionalSettingsVisible(): void {
    this.isAdditionalSettingsVisible.update((visible) => !visible);
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

  onMinGoalieGamesInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.minGoalieGames.set(Math.min(FULL_SEASON_GAMES, Math.max(0, Math.round(parsed))));
    }
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
  protected readonly FULL_SEASON_GAMES = FULL_SEASON_GAMES;
}
