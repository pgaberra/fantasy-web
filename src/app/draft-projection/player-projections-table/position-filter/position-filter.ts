import { Component, model, signal } from '@angular/core';
import { PositionFilter } from '../../model';

@Component({
  selector: 'app-position-filter',
  templateUrl: './position-filter.html',
  styleUrl: './position-filter.css',
})
export class PositionFilterComponent {
  readonly value = model.required<PositionFilter>();
  readonly options = signal<{ value: PositionFilter; label: string }[]>([
    { value: 'ALL', label: 'All players' },
    { value: 'LW', label: 'LW' },
    { value: 'C', label: 'C' },
    { value: 'RW', label: 'RW' },
    { value: 'D', label: 'D' },
  ]);

  onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value as PositionFilter);
  }
}
