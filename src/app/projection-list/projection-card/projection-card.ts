import { Component, input, output } from '@angular/core';
import { ProjectionSummaryResponse } from '../../api/models/projection-summary-response';

@Component({
  selector: 'li[app-projection-card]',
  templateUrl: './projection-card.html',
  styleUrl: './projection-card.css',
})
export class ProjectionCardComponent {
  readonly projection = input.required<ProjectionSummaryResponse>();
  readonly edit = output<void>();
  readonly remove = output<void>();
}
