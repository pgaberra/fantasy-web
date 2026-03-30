import { Component, computed, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { FormatToiPipe } from '../../../../../pipes/format-toi.pipe';

@Component({
  selector: 'app-toi-input',
  imports: [],
  providers: [FormatToiPipe],
  templateUrl: './toi-input.html',
  styleUrl: '../stat-input.css',
})
export class ToiInputComponent {
  private readonly formatToiPipe = inject(FormatToiPipe);

  toiInSeconds = input.required<number>();

  toiInput = output<Event>();
  toiKeydown = output<KeyboardEvent>();

  formattedValue = computed(() => this.formatToiPipe.transform(this.toiInSeconds()));

  onInput(event: Event) {
    this.toiInput.emit(event);
  }

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  onBlur() {
    const inputEl = this.inputRef()?.nativeElement;
    if (inputEl) {
      inputEl.value = this.formattedValue();
    }
  }

  onKeydown(event: KeyboardEvent) {
    this.toiKeydown.emit(event);
  }
}
