import { Component, computed, inject, input, output } from '@angular/core';
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

  statInput = output<{ playerId: number; key: StatKey; event: Event }>();
  toiKeydown = output<{ playerId: number; event: KeyboardEvent }>();

  isToi = computed(() => this.statInfoService.isToiStat(this.key()));
  canStatBeNegative = computed(() => this.statInfoService.canStatBeNegative(this.key()));
  isPercentage = computed(() => this.statInfoService.isPercentageStat(this.key()));

  formattedValue = computed(() => {
    const decimals = this.decimalSettings()[this.key() as DecimalStatKey] ?? 0;
    return parseFloat(this.value().toFixed(decimals)).toString();
  });

  onKeydown(event: KeyboardEvent) {
    this.toiKeydown.emit({ playerId: this.playerId(), event });
  }

  onInput(event: Event) {
    this.statInput.emit({ playerId: this.playerId(), key: this.key(), event });
  }
}
