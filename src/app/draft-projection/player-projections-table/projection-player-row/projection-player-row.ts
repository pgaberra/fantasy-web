import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Player, StatKey } from '../../../models/player.model';
import { ActiveColumns, PlayerProjection, ScoringType } from '../../model';
import { FormatToiPipe } from '../../../pipes/format-toi.pipe';
import { DecimalStatKey } from '../../projection-settings-section/model';

@Component({
  selector: 'tr[app-projection-player-row]',
  imports: [DecimalPipe, FormatToiPipe],
  templateUrl: './projection-player-row.html',
  styleUrl: './projection-player-row.css',
})
export class ProjectionPlayerRowComponent {
  rank = input.required<number>();
  projection = input.required<PlayerProjection>();
  player = input.required<Player>();
  activeColumns = input.required<ActiveColumns>();
  scoringType = input.required<ScoringType>();
  decimalSettings = input.required<Record<DecimalStatKey, number>>();

  statInput = output<{ playerId: number; key: StatKey; event: Event }>();
  toiKeydown = output<{ playerId: number; event: KeyboardEvent }>();

  playerPosition = computed(() => Array.from(this.player().positions).join(', '));

  formatStat(value: number, key: DecimalStatKey): string {
    const decimals = this.decimalSettings()[key];
    return parseFloat(value.toFixed(decimals)).toString();
  }
}
