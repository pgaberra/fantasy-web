import { Component, model, signal } from '@angular/core';
import { PositionFilter } from '../../../models/projection.model';
import { PositionFilterOption } from './model';

@Component({
  selector: 'app-position-filter',
  templateUrl: './position-filter.html',
  styleUrl: './position-filter.css',
})
export class PositionFilterComponent {
  readonly value = model.required<PositionFilter>();
  readonly options = signal<PositionFilterOption[]>([
    { value: 'ALL', label: 'All players' },
    { value: 'LW', label: 'LW' },
    { value: 'C', label: 'C' },
    { value: 'RW', label: 'RW' },
    { value: 'D', label: 'D' },
    { value: 'G', label: 'G' },
  ]);

  onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value as PositionFilter);
  }
}
