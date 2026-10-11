import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A tooltip's content: one sentence, or a list when it explains several things side by side. */
export type TooltipText = string | readonly string[];

@Component({
  selector: 'app-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items(); as list) {
      <ul>
        @for (item of list; track $index) {
          <li>{{ item }}</li>
        }
      </ul>
    } @else {
      {{ text() }}
    }
  `,
  styleUrl: './tooltip.css',
  host: {
    role: 'tooltip',
  },
})
export class TooltipComponent {
  readonly text = input<TooltipText>('');
  protected readonly items = computed(() => {
    const text = this.text();
    return typeof text === 'string' ? null : text;
  });
}
