import { Component, input, output, signal } from '@angular/core';
import { ScoringStatKey } from '../../../../models/stat-key.model';
import { StatLabelPipe } from '../../../../pipes/stat-label.pipe';
import { StatTooltipPipe } from '../../../../pipes/stat-tooltip.pipe';
import { TooltipDirective } from '../../../../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-stat-add-dropdown',
  templateUrl: './stat-add-dropdown.html',
  styleUrl: './stat-add-dropdown.css',
  imports: [StatLabelPipe, StatTooltipPipe, TooltipDirective],
})
export class StatAddDropdownComponent {
  availableStats = input.required<ScoringStatKey[]>();
  statSelected = output<ScoringStatKey>();

  dropdownOpen = signal(false);

  selectStat(key: ScoringStatKey): void {
    this.statSelected.emit(key);
    this.dropdownOpen.set(false);
  }
}
