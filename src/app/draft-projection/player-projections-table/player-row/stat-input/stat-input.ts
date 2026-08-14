import { Component, computed, inject, input, output, signal } from '@angular/core';
import { StatKey } from '../../../../models/stat-key.model';
import { StatInfoService } from '../../../../services/stat-info.service';
import { DecimalStatKey } from '../../../projection-settings-section/model';
import { ToiInputComponent } from './toi-input/toi-input';
import { TooltipDirective } from '../../../../shared/tooltip/tooltip.directive';

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
  canStatBeNegative = computed(() => this.statInfoService.canStatBeNegative(this.key()));
  isPercentage = computed(() => this.statInfoService.isPercentageStat(this.key()));

  /**
   * A column set to N decimals shows N decimals, trailing zeros included — 272 at 3 decimals
   * reads `272.000`, the way the setting says it should.
   *
   * While the cell has focus the trailing zeros are dropped again: the value binding rewrites
   * the input whenever this string changes, so padding a half-typed number would push the caret
   * past what the user just typed and turn the next keystroke into garbage.
   */
  formattedValue = computed(() => {
    const decimals = this.decimalSettings()[this.key() as DecimalStatKey] ?? 0;
    const padded = this.value().toFixed(decimals);
    return this.isFocused() ? parseFloat(padded).toString() : padded;
  });

  private readonly isFocused = signal(false);

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
}
