import { Component, model } from '@angular/core';
import { ScoringType } from '../model';

@Component({
  selector: 'app-scoring-type-section',
  templateUrl: './scoring-type-section.html',
  styleUrl: './scoring-type-section.css',
})
export class ScoringTypeSectionComponent {
  scoringType = model.required<ScoringType>();

  select(type: ScoringType): void {
    this.scoringType.set(type);
  }
}
