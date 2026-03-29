import { Component, computed, input, model } from '@angular/core';
import { ScoringStatKey } from '../../../models/stat-key.model';
import { ActiveColumns, ScoringType } from '../../../models/projection.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { DecimalStatKey } from '../../projection-settings-section/model';

@Component({
  selector: 'thead[app-projections-table-header]',
  imports: [StatLabelPipe],
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
  summaryLabel = computed(() => (this.scoringType() === 'points' ? 'Fan Pts' : 'Z-Score'));

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
