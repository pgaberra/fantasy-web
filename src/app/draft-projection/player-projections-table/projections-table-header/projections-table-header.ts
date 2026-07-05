import { Component, computed, input, model, output } from '@angular/core';
import { ScoringStatKey } from '../../../models/stat-key.model';
import {
  ActiveColumns,
  ScoringType,
  SortColumn,
  SortDirection,
} from '../../../models/projection.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { StatTooltipPipe } from '../../../pipes/stat-tooltip.pipe';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';
import { DecimalStatKey } from '../../projection-settings-section/model';

@Component({
  selector: 'thead[app-projections-table-header]',
  imports: [StatLabelPipe, StatTooltipPipe, TooltipDirective],
  templateUrl: './projections-table-header.html',
  styleUrl: './projections-table-header.css',
})
export class ProjectionsTableHeaderComponent {
  protected readonly MAX_DECIMAL_SETTING = 3;
  activeColumns = input.required<ActiveColumns>();
  scoringType = input.required<ScoringType>();
  statWeights = model.required<Record<ScoringStatKey, number>>();
  useDefaultDecimals = input<boolean>(false);
  decimalSettings = model.required<Record<DecimalStatKey, number>>();
  sortColumn = input.required<SortColumn>();
  sortDirection = input.required<SortDirection>();
  readonly sort = output<SortColumn>();
  summaryLabel = computed(() => (this.scoringType() === 'points' ? 'Total Points' : 'Z-Score'));

  sortIndicator(column: SortColumn): string {
    if (this.sortColumn() !== column) {
      return '';
    }
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }

  gpDecimalSetting = computed(() => this.decimalSettings().gp);

  onDecimalInput(key: DecimalStatKey, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Math.max(0, Math.min(this.MAX_DECIMAL_SETTING, raw));
    this.decimalSettings.update((settings) => ({ ...settings, [key]: value }));
  }

  onWeightInput(key: ScoringStatKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.statWeights.update((weights) => ({ ...weights, [key]: value }));
  }
}
