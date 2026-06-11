import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-team-filter',
  templateUrl: './team-filter.html',
  styleUrl: './team-filter.css',
})
export class TeamFilterComponent {
  readonly value = model.required<string>();
  readonly teams = input.required<string[]>();

  onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
