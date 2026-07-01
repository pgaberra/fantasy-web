import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '{{ text() }}',
  styleUrl: './tooltip.css',
  host: {
    role: 'tooltip',
  },
})
export class TooltipComponent {
  readonly text = input('');
}
