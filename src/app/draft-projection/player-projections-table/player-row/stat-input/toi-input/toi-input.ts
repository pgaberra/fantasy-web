import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormatToiPipe } from '../../../../../pipes/format-toi.pipe';
import { StatStepperComponent } from '../stat-stepper/stat-stepper';
import { TooltipDirective } from '../../../../../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-toi-input',
  imports: [StatStepperComponent, TooltipDirective],
  providers: [FormatToiPipe],
  templateUrl: './toi-input.html',
  styleUrl: '../stat-input.css',
})
export class ToiInputComponent {
  private readonly formatToiPipe = inject(FormatToiPipe);

  toiInSeconds = input.required<number>();
  warning = input<string | null>(null);

  toiInput = output<Event>();
  toiKeydown = output<KeyboardEvent>();

  formattedValue = computed(() => this.formatToiPipe.transform(this.toiInSeconds()));

  onInput(event: Event) {
    this.toiInput.emit(event);
  }

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  protected readonly isFocused = signal(false);

  onFocus() {
    this.isFocused.set(true);
  }

  onBlur() {
    this.isFocused.set(false);
    const inputEl = this.inputRef()?.nativeElement;
    if (inputEl) {
      inputEl.value = this.formattedValue();
    }
  }

  /**
   * Time on ice is minutes and seconds, so it has no step of its own — the table moves it a second
   * at a time off the arrow keys. The touch stepper raises that same key, which keeps one rule for
   * how far a tap or a press moves the clock.
   */
  onStepped(direction: 1 | -1) {
    this.toiKeydown.emit(
      new KeyboardEvent('keydown', { key: direction === 1 ? 'ArrowUp' : 'ArrowDown' }),
    );
  }

  onKeydown(event: KeyboardEvent) {
    this.toiKeydown.emit(event);
  }
}
