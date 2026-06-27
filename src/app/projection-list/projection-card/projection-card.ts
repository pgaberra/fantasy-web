import { Component, input, output, signal } from '@angular/core';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';

@Component({
  selector: 'li[app-projection-card]',
  imports: [RelativeTimePipe],
  templateUrl: './projection-card.html',
  styleUrl: './projection-card.css',
})
export class ProjectionCardComponent {
  readonly projection = input.required<ProjectionSummaryResponse>();
  readonly edit = output<void>();
  readonly draft = output<void>();
  readonly remove = output<void>();

  readonly confirmingDelete = signal(false);

  startDelete(): void {
    this.confirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.remove.emit();
  }
}
