import { Component, computed, inject, input, output, Signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Player } from '../../../models/player.model';
import { StatKey } from '../../../models/stat-key.model';
import {
  ActiveColumns,
  PlayerScore,
  Projection,
  ScoringType,
} from '../../../models/projection.model';
import { DecimalStatKey } from '../../projection-settings-section/model';
import { StatInputComponent } from './stat-input/stat-input';
import { StatWarningService } from '../../../services/stat-warning.service';
import { StatInfoService } from '../../../services/stat-info.service';

@Component({
  selector: 'tr[app-player-row]',
  imports: [DecimalPipe, StatInputComponent],
  templateUrl: './player-row.html',
  styleUrl: './player-row.css',
  host: {
    '[class.editing-row]': 'isEditing()',
  },
})
export class PlayerRowComponent {
  positionRank = input.required<number>();
  totalRank = input.required<number | null>();
  rank: Signal<string> = computed(() => {
    if (this.totalRank() === null) {
      return this.positionRank().toString();
    }

    return `${this.positionRank()} (${this.totalRank()})`;
  });
  projection = input.required<Projection>();
  playerScore = input.required<PlayerScore>();
  scoringType = input.required<ScoringType>();
  activeColumns = input.required<ActiveColumns>();
  player = input.required<Player>();
  /** Whether this player is a rookie this season. False also covers "we could not find out". */
  rookie = input<boolean>(false);
  decimalSettings = input.required<Record<DecimalStatKey, number>>();
  isEditing = input<boolean>(false);
  belowMinGames = input<boolean>(false);
  readonly = input<boolean>(false);

  statInput = output<{ playerId: number; key: StatKey; event: Event }>();
  toiKeydown = output<{ playerId: number; event: KeyboardEvent }>();

  private readonly statWarningService = inject(StatWarningService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly warnings = computed(() =>
    this.statWarningService.warningsFor(this.projection()),
  );

  warningFor(key: StatKey): string | null {
    return this.warnings().get(key) ?? null;
  }

  playerPosition = computed(() => {
    const p = this.player();
    return p.type === 'skater' ? Array.from(p.positions).join(', ') : 'G';
  });

  getStatValue(key: StatKey): number {
    const p = this.projection();
    const stats = { ...p.stats.utility, ...p.stats.scoring } as Record<StatKey, number>;
    return stats[key];
  }

  isStatApplicable(key: StatKey): boolean {
    return this.statInfoService.isStatApplicable(key, this.player());
  }
}
