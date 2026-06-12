import { Component, input } from '@angular/core';

@Component({
  selector: 'app-info-tooltip',
  standalone: true,
  templateUrl: './info-tooltip.html',
  styleUrl: './info-tooltip.css',
})
export class InfoTooltipComponent {
  text = input.required<string>();
}
