import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { StatKey } from '../../../../models/stat-key.model';
import { StatInfoService } from '../../../../services/stat-info.service';
import { DecimalStatKey } from '../../../projection-settings-section/model';
import { ToiInputComponent } from './toi-input/toi-input';
import { TooltipDirective } from '../../../../shared/tooltip/tooltip.directive';
import { parseDecimalInput, steppedDecimalInput } from '../../../../shared/decimal-input';

@Component({
  selector: 'app-stat-input',
  imports: [ToiInputComponent, TooltipDirective],
  templateUrl: './stat-input.html',
  styleUrl: './stat-input.css',
})
export class StatInputComponent {
  private readonly statInfoService = inject(StatInfoService);

  isStatApplicable = input.required<boolean>();
  playerId = input.required<number>();
  key = input.required<StatKey>();
  value = input.required<number>();
  decimalSettings = input.required<Record<DecimalStatKey, number>>();
  warning = input<string | null>(null);
  // The shared page reuses this cell so a published projection looks like the table it
  // came from; it just has nothing to edit.
  readonly = input<boolean>(false);

  statInput = output<{ playerId: number; key: StatKey; event: Event }>();
  toiKeydown = output<{ playerId: number; event: KeyboardEvent }>();

  isToi = computed(() => this.statInfoService.isToiStat(this.key()));

  /** Time on ice is stored in seconds; read-only cells show it the way the editor's input does. */
  formattedToi = computed(() => {
    const seconds = Math.max(0, Math.round(this.value()));
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  });
  private readonly decimals = computed(
    () => this.decimalSettings()[this.key() as DecimalStatKey] ?? 0,
  );

  /**
   * A column set to N decimals shows N decimals, trailing zeros included — 272 at 3 decimals
   * reads `272.000`, the way the setting says it should. The padding stays on while the cell has
   * focus, so clicking into a value doesn't make its decimals disappear.
   */
  formattedValue = computed(() => this.value().toFixed(this.decimals()));

  /**
   * The arrow keys move by the smallest amount the column can show — a column set to one decimal
   * steps 369.0 to 369.1, not to 370.
   */
  private readonly stepSize = computed(() => Number(`1e-${this.decimals()}`));

  private readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('statField');
  private readonly isFocused = signal(false);

  constructor() {
    effect(() => {
      // Read before anything else: a TOI cell, a read-only cell and a stat the player can't have
      // render no input at all, and none of them has a value worth formatting.
      const element = this.inputElement()?.nativeElement;
      if (!element) return;
      const formatted = this.formattedValue();
      const isFocused = this.isFocused();
      // A field that is being typed in owns its own text: pushing `369.0` back over a half-typed
      // `369` would move the caret past what was just entered. So while it holds the number that
      // is stored — padding and all the ways of writing it aside — it is left alone, and only an
      // entry the table rounded or clamped to something else is corrected. Blur re-pads it.
      if (isFocused && parseDecimalInput(element.value) === this.value()) return;
      element.value = formatted;
    });
  }

  onFocus() {
    this.isFocused.set(true);
  }

  onBlur() {
    this.isFocused.set(false);
  }

  onKeydown(event: KeyboardEvent) {
    this.toiKeydown.emit({ playerId: this.playerId(), event });
  }

  onInput(event: Event) {
    this.statInput.emit({ playerId: this.playerId(), key: this.key(), event });
  }

  /**
   * A text field does not step itself, so the arrow keys are handled here: the field is written
   * first and then reported, so the table reads the stepped value off it like any other edit.
   */
  onStatKeydown(event: KeyboardEvent) {
    const field = event.target as HTMLInputElement;
    const stepped = steppedDecimalInput(field.value, event.key, this.stepSize());
    if (stepped === null) return;
    // The arrow would otherwise jump the caret to the end of the text it just changed.
    event.preventDefault();
    field.value = `${stepped}`;
    this.onInput(event);
  }
}
