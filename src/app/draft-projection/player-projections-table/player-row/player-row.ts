import { formatDate } from '@angular/common';
import { Component, computed, inject, input, output, Signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PlayerInjury } from '../../../api/models/player-injury';
import { Player } from '../../../models/player.model';
import { StatKey } from '../../../models/stat-key.model';
import {
  ActiveColumns,
  PlayerScore,
  Projection,
  ScoringType,
} from '../../../models/projection.model';
import { DecimalStatKey } from '../../projection-settings-section/model';
import { PlayerHeadshotComponent } from '../../../shared/player-headshot/player-headshot';
import { StatInputComponent } from './stat-input/stat-input';
import { StatWarningService } from '../../../services/stat-warning.service';
import { StatInfoService } from '../../../services/stat-info.service';
import { SkaterPosition } from '../../../models/position.model';
import { PopoverTriggerDirective } from '../../../shared/popover/popover-trigger.directive';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';
import { PositionMenuComponent } from '../position-menu/position-menu';
import { PositionChipsComponent } from '../../../shared/position-chips/position-chips';

@Component({
  selector: 'tr[app-player-row]',
  imports: [
    DecimalPipe,
    StatInputComponent,
    PlayerHeadshotComponent,
    PopoverTriggerDirective,
    TooltipDirective,
    PositionMenuComponent,
    PositionChipsComponent,
  ],
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

  /**
   * The badge text: short enough to sit beside a name without pushing the numbers along. The
   * report's own words are longer than the space, so they are abbreviated to the forms a fantasy
   * manager already reads on a roster page.
   */
  readonly injuryLabel = computed(() => {
    const status = this.injury()?.status;
    if (!status) {
      return '';
    }
    if (status === 'Day-To-Day') {
      return 'DTD';
    }
    if (status === 'Suspension') {
      return 'SUSP';
    }
    return status === 'Injured Reserve' ? 'IR' : 'OUT';
  });

  /** The whole of what the report says, for the reader who stops on the badge. */
  readonly injuryTooltip = computed(() => {
    const injury = this.injury();
    if (!injury) {
      return '';
    }
    const parts = [injury.status];
    if (injury.bodyPart) {
      parts.push(injury.bodyPart.toLowerCase());
    }
    if (injury.expectedReturn) {
      parts.push(`expected back ${formatDate(injury.expectedReturn, 'd MMMM', 'en')}`);
    }
    return parts.join(', ');
  });
  projection = input.required<Projection>();
  playerScore = input.required<PlayerScore>();
  scoringType = input.required<ScoringType>();
  activeColumns = input.required<ActiveColumns>();
  player = input.required<Player>();
  /**
   * Whether the table draws a headshot beside each name — decided over the whole table
   * (`hasHeadshots`), not per row, so a player without a picture still lines up with those who
   * have one. Required so no table can forget to decide.
   */
  showHeadshot = input.required<boolean>();
  /** Whether this player is a rookie this season. False also covers "we could not find out". */
  rookie = input<boolean>(false);
  /** The current injury report for this player, or null when he is not on it. */
  injury = input<PlayerInjury | null>(null);
  decimalSettings = input.required<Record<DecimalStatKey, number>>();
  isEditing = input<boolean>(false);
  belowMinGames = input<boolean>(false);
  readonly = input<boolean>(false);

  /**
   * Whether the owner may overrule this player's positions. Off wherever the board is somebody
   * else's or nothing is saved: a shared projection, the landing demo.
   */
  positionsEditable = input<boolean>(false);
  /** Whether the positions shown are the owner's correction rather than the default ones. */
  positionsOverridden = input<boolean>(false);
  /** How many players are corrected in all, so the menu can offer to put them all back. */
  positionsOverriddenCount = input<number>(0);

  statInput = output<{ playerId: number; key: StatKey; event: Event }>();
  positionsChanged = output<{ playerId: number; positions: SkaterPosition[] | null }>();
  positionsReset = output<void>();
  toiKeydown = output<{ playerId: number; event: KeyboardEvent }>();

  private readonly statWarningService = inject(StatWarningService);
  private readonly statInfoService = inject(StatInfoService);
  private readonly warnings = computed(() =>
    this.statWarningService.warningsFor(this.projection()),
  );

  warningFor(key: StatKey): string | null {
    return this.warnings().get(key) ?? null;
  }

  /** The positions drawn as chips, in the order the pool lists them. */
  readonly positionList = computed<readonly string[]>(() => {
    const p = this.player();
    return p.type === 'skater' ? [...p.positions] : ['G'];
  });

  /** The same positions in words, for the trigger's accessible name. */
  readonly playerPosition = computed(() => this.positionList().join(', '));

  /** Goalies are always and only G, so there is nothing to correct and no menu to offer. */
  readonly canEditPositions = computed(
    () => this.positionsEditable() && this.player().type === 'skater',
  );

  readonly skaterPositions = computed<ReadonlySet<SkaterPosition>>(() => {
    const p = this.player();
    return p.type === 'skater' ? p.positions : new Set<SkaterPosition>();
  });

  /** Merged once per row rather than once per cell: the template asks for a dozen-odd stats and
   * each ask used to rebuild the player's whole stat line to read one number out of it. */
  private readonly stats = computed(
    () =>
      ({ ...this.projection().stats.utility, ...this.projection().stats.scoring }) as Record<
        StatKey,
        number
      >,
  );

  getStatValue(key: StatKey): number {
    return this.stats()[key];
  }

  isStatApplicable(key: StatKey): boolean {
    return this.statInfoService.isStatApplicable(key, this.player());
  }
}
