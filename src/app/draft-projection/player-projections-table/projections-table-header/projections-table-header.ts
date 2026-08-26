import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import {
  SCORING_STAT_KEYS,
  ScoringStatKey,
  StatKey,
  UTILITY_STAT_KEYS,
  UtilityStatKey,
} from '../../../models/stat-key.model';
import {
  ActiveColumns,
  ScoringType,
  SortColumn,
  SortDirection,
} from '../../../models/projection.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { STAT_FULL_NAMES, StatTooltipPipe } from '../../../pipes/stat-tooltip.pipe';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';
import { PopoverTriggerDirective } from '../../../shared/popover/popover-trigger.directive';
import { HelpTipComponent } from '../../../shared/help-tip/help-tip';
import { ToggleSwitchComponent } from '../../projection-settings-section/toggle-switch/toggle-switch';
import {
  DecimalStatKey,
  ScaleConfig,
  scalableScoringStatsFor,
} from '../../projection-settings-section/model';
import { StatInfoService } from '../../../services/stat-info.service';

@Component({
  selector: 'thead[app-projections-table-header]',
  imports: [
    StatLabelPipe,
    StatTooltipPipe,
    TooltipDirective,
    PopoverTriggerDirective,
    ToggleSwitchComponent,
    HelpTipComponent,
  ],
  templateUrl: './projections-table-header.html',
  styleUrl: './projections-table-header.css',
  // Where the rule between the utility and the scoring columns sits depends on whether the
  // menu dots fill the utility column's gutter, and the rule is drawn from the scoring cell —
  // which cannot see that. The thead carries the answer for every row at once.
  host: { '[class.has-column-menus]': 'showColumnControls()' },
})
export class ProjectionsTableHeaderComponent {
  protected readonly MAX_DECIMAL_SETTING = 3;
  private readonly statInfoService = inject(StatInfoService);

  /** The columns actually rendered — already filtered by the table's position filter. */
  activeColumns = input.required<ActiveColumns>();
  scoringType = input.required<ScoringType>();
  statWeights = model.required<Record<ScoringStatKey, number>>();
  useDefaultDecimals = input<boolean>(false);
  decimalSettings = model.required<Record<DecimalStatKey, number>>();
  sortColumn = input.required<SortColumn>();
  sortDirection = input.required<SortDirection>();
  readonly sort = output<SortColumn>();
  readonly showFullSeasonButton = input<boolean>(false);
  // A shared page shows the same header, minus the rows that exist to change things.
  readonly readonly = input<boolean>(false);
  /**
   * Whether the column headings sort the table. Off for a surface holding only part of the board
   * — sorting rows that are already a slice of it would answer with the wrong players, and a
   * heading that looks clickable and isn't is worse than one that never offered.
   */
  readonly sortable = input<boolean>(true);
  readonly fullSeason = output<void>();

  /**
   * Per-column settings live on the column itself instead of a separate panel. Off by default so
   * surfaces that keep the settings panel (the landing demo) render exactly as before.
   */
  readonly columnControls = input<boolean>(false);
  /**
   * Unfiltered, unlike `activeColumns`: which scoring stats a utility column may scale depends on
   * what the projection tracks, not on what the current position filter leaves visible.
   */
  readonly allActiveScoringColumns = input<Set<ScoringStatKey>>(new Set<ScoringStatKey>());
  readonly scaleSettings = input<Record<UtilityStatKey, ScaleConfig> | null>(null);

  /**
   * A shared page renders this same header, so the two flags are resolved in one place: nothing
   * that edits the projection may appear on a read-only surface, whatever it passes in.
   */
  readonly showColumnControls = computed(() => this.columnControls() && !this.readonly());

  readonly scoringColumnToggled = output<ScoringStatKey>();
  readonly utilityColumnToggled = output<UtilityStatKey>();
  readonly scaleToggled = output<UtilityStatKey>();
  readonly scaleStatToggled = output<{ utilityKey: UtilityStatKey; statKey: ScoringStatKey }>();

  summaryLabel = computed(() => (this.scoringType() === 'points' ? 'Total Points' : 'Z-Score'));

  /** No utility columns, nothing to divide the header into — the rule would sit at its left edge. */
  readonly hasUtilityColumns = computed(() => this.activeColumns().utility.size > 0);

  /**
   * The one thing the header cannot say by itself: a utility column takes no weight and adds
   * nothing to the summary. In points mode the empty cells in the weight row hint at it; in
   * Z-Score mode there is no weight row at all, so the role is stated here rather than in
   * permanent chrome the two-column group has no room for.
   *
   * Scaling is only half of that role, and only where there is a projection to scale. On a
   * leaderboard of measured games the same column is a number that already happened, so
   * promising it drives other stats would describe a control the page does not have.
   */
  utilityTooltip(statKey: UtilityStatKey): string {
    const name = STAT_FULL_NAMES[statKey];
    return this.scaleSettings()
      ? `${name} — a Utility Stat that can be used to scale and project other stats.`
      : `${name} — a Utility Stat: it takes no weight and adds nothing to the total.`;
  }

  /** Which column's "stats to scale" list is expanded; only one menu is open at a time. */
  readonly expandedScaleList = signal<UtilityStatKey | null>(null);

  private readonly activeScoringColumnsSorted = computed(() =>
    Array.from(this.allActiveScoringColumns()).sort(
      (a, b) => SCORING_STAT_KEYS.indexOf(a) - SCORING_STAT_KEYS.indexOf(b),
    ),
  );

  sortIndicator(column: SortColumn): string {
    if (this.sortColumn() !== column) {
      return '';
    }
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }

  gpDecimalSetting = computed(() => this.decimalSettings().gp);

  onDecimalInput(statKey: DecimalStatKey, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const decimals = Math.max(0, Math.min(this.MAX_DECIMAL_SETTING, raw));
    this.decimalSettings.update((settings) => ({ ...settings, [statKey]: decimals }));
  }

  onWeightInput(statKey: ScoringStatKey, event: Event): void {
    const weight = Number((event.target as HTMLInputElement).value);
    this.statWeights.update((weights) => ({ ...weights, [statKey]: weight }));
  }

  isUtilityColumn(statKey: StatKey): statKey is UtilityStatKey {
    return (UTILITY_STAT_KEYS as readonly string[]).includes(statKey);
  }

  isDecimalColumn(statKey: StatKey): statKey is DecimalStatKey {
    // Checked against the key list rather than `in decimalSettings`, so this stays a decision
    // about which stats have decimals rather than about the shape of a runtime object.
    return statKey === 'gp' || (SCORING_STAT_KEYS as readonly string[]).includes(statKey);
  }

  /** The column menu's own heading — always the full name, even where it matches the label. */
  fullNameOf(statKey: StatKey): string {
    return STAT_FULL_NAMES[statKey];
  }

  decimalsFor(statKey: StatKey): number {
    return this.isDecimalColumn(statKey) ? this.decimalSettings()[statKey] : 0;
  }

  removeColumn(statKey: StatKey): void {
    if (this.isUtilityColumn(statKey)) {
      this.utilityColumnToggled.emit(statKey);
    } else {
      this.scoringColumnToggled.emit(statKey);
    }
  }

  isScaleActive(utilityKey: UtilityStatKey): boolean {
    return this.scaleSettings()?.[utilityKey].scale ?? false;
  }

  scalableStatsFor(utilityKey: UtilityStatKey): ScoringStatKey[] {
    return scalableScoringStatsFor(utilityKey, this.activeScoringColumnsSorted(), (statKey) =>
      this.statInfoService.isRateStat(statKey),
    );
  }

  isScaleStatActive(statKey: ScoringStatKey, utilityKey: UtilityStatKey): boolean {
    return this.scaleSettings()?.[utilityKey].scalableStats.has(statKey) ?? false;
  }

  scaledStatSummary(utilityKey: UtilityStatKey): string {
    const scalable = this.scalableStatsFor(utilityKey);
    const selected = scalable.filter((statKey) => this.isScaleStatActive(statKey, utilityKey));
    return `${selected.length} of ${scalable.length}`;
  }

  toggleScaleList(utilityKey: UtilityStatKey): void {
    this.expandedScaleList.update((open) => (open === utilityKey ? null : utilityKey));
  }
}
