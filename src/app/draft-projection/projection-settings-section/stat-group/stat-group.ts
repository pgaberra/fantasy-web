import { Component, input, output } from '@angular/core';
import { ScoringStatKey } from '../../../models/stat-key.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { StatAddDropdownComponent } from './stat-add-dropdown/stat-add-dropdown';

@Component({
  selector: 'app-stat-group',
  templateUrl: './stat-group.html',
  styleUrl: './stat-group.css',
  imports: [StatLabelPipe, StatAddDropdownComponent],
})
export class StatGroupComponent {
  title = input.required<string>();
  activeStats = input.required<ScoringStatKey[]>();
  availableStats = input.required<ScoringStatKey[]>();

  statRemoved = output<ScoringStatKey>();
  statAdded = output<ScoringStatKey>();
}
