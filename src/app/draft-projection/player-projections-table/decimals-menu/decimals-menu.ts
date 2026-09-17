import { Component, computed, inject, input, output } from '@angular/core';
import { SCORING_STAT_KEYS, ScoringStatKey, UtilityStatKey } from '../../../models/stat-key.model';
import { STAT_LABELS, StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { STAT_FULL_NAMES } from '../../../pipes/stat-tooltip.pipe';
import { StatInfoService } from '../../../services/stat-info.service';
import { DecimalStatKey } from '../../projection-settings-section/model';
import {
  MAX_DECIMAL_SETTING,
  takesDecimals,
} from '../../projection-settings-section/model-decimals';

/**
 * Every column's decimals in one place. A column's own menu still sets its own, but a table of
 * twelve stats meant twelve menus to give them all a decimal place, and nowhere showed what they
 * were all set to.
 *
 * The row at the top sets the counting stats together and leaves the rate stats alone: SV% is
 * read at three places and GAA at two, so one number for every column would print .915 as 0.9.
 */
@Component({
  selector: 'app-decimals-menu',
  templateUrl: './decimals-menu.html',
  styleUrl: './decimals-menu.css',
  imports: [StatLabelPipe],
})
export class DecimalsMenuComponent {
  private readonly statInfoService = inject(StatInfoService);

  readonly scoringColumns = input.required<Set<ScoringStatKey>>();
  readonly utilityColumns = input.required<Set<UtilityStatKey>>();
  /** The decimals on screen, which is what a pressed button has to agree with. */
  readonly decimalSettings = input.required<Record<DecimalStatKey, number>>();
  readonly usingDefaults = input.required<boolean>();

  readonly decimalSettingsChange = output<Record<DecimalStatKey, number>>();
  readonly resetToDefaults = output<void>();

  readonly choices = Array.from({ length: MAX_DECIMAL_SETTING + 1 }, (_, decimals) => decimals);

  /** In the order the table draws them: games played, then the scoring stats. */
  readonly columns = computed<DecimalStatKey[]>(() => {
    const scoring = SCORING_STAT_KEYS.filter((statKey) => this.scoringColumns().has(statKey));
    const all: DecimalStatKey[] = this.utilityColumns().has('gp') ? ['gp', ...scoring] : scoring;
    return all.filter(takesDecimals);
  });

  private readonly countingColumns = computed(() =>
    this.columns().filter((statKey) => !this.statInfoService.isRateStat(statKey)),
  );

  /** With no rate stat in the table there is no other kind to tell the counting stats from. */
  readonly bulkLabel = computed(() =>
    this.countingColumns().length === this.columns().length ? 'All stats' : 'All counting stats',
  );

  readonly showBulkRow = computed(() => this.countingColumns().length > 1);

  /** What the counting stats share, or null when they differ and no button is the pressed one. */
  readonly sharedCountingDecimals = computed<number | null>(() => {
    const settings = this.decimalSettings();
    const inUse = new Set(this.countingColumns().map((statKey) => settings[statKey]));
    return inUse.size === 1 ? [...inUse][0] : null;
  });

  /** The full name beside the abbreviation, unless the column is already headed by it. */
  descriptionOf(statKey: DecimalStatKey): string | null {
    const fullName = STAT_FULL_NAMES[statKey];
    return fullName === STAT_LABELS[statKey] ? null : fullName;
  }

  setDecimals(statKey: DecimalStatKey, decimals: number): void {
    this.decimalSettingsChange.emit({ ...this.decimalSettings(), [statKey]: decimals });
  }

  setCountingDecimals(decimals: number): void {
    const settings = { ...this.decimalSettings() };
    for (const statKey of this.countingColumns()) {
      settings[statKey] = decimals;
    }
    this.decimalSettingsChange.emit(settings);
  }
}
