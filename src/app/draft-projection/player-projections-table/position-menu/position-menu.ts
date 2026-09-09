import { Component, computed, input, output } from '@angular/core';
import { SKATER_POSITIONS, SkaterPosition } from '../../../models/position.model';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';
import { IconComponent } from '../../../shared/icon/icon';

/**
 * Corrects which positions one skater is eligible for.
 *
 * The app's positions come from a single platform's player pool, and the platforms disagree about
 * eligibility, so a projection drafted for an ESPN league can be reading Yahoo's answer. This is
 * where the owner overrules it. A player must stay eligible somewhere, so the last remaining
 * position cannot be unticked.
 */
@Component({
  selector: 'app-position-menu',
  imports: [TooltipDirective, IconComponent],
  templateUrl: './position-menu.html',
  styleUrl: './position-menu.css',
})
export class PositionMenuComponent {
  readonly playerName = input.required<string>();
  readonly positions = input.required<ReadonlySet<SkaterPosition>>();
  /** Whether these positions are the owner's correction rather than the default ones. */
  readonly overridden = input<boolean>(false);
  /** How many players are corrected in all, this one included. */
  readonly overriddenCount = input<number>(0);

  /** The new positions, or null to go back to the default ones. */
  readonly positionsChanged = output<SkaterPosition[] | null>();
  readonly allReset = output<void>();

  /**
   * Putting the whole pool back is offered here because this menu is where someone is standing
   * when they think about positions at all. It is left out when this player is the only one
   * corrected, since the button above it would then do exactly the same thing.
   */
  readonly canResetAll = computed(() => this.overriddenCount() - (this.overridden() ? 1 : 0) > 0);

  readonly allPositions = SKATER_POSITIONS;

  private readonly onlyPosition = computed(() =>
    this.positions().size === 1 ? [...this.positions()][0] : null,
  );

  isSelected(position: SkaterPosition): boolean {
    return this.positions().has(position);
  }

  /** The one remaining position is locked: a skater eligible nowhere would vanish from the board. */
  isLocked(position: SkaterPosition): boolean {
    return this.onlyPosition() === position;
  }

  toggle(position: SkaterPosition): void {
    if (this.isLocked(position)) {
      return;
    }
    const next = new Set(this.positions());
    if (!next.delete(position)) {
      next.add(position);
    }
    this.positionsChanged.emit(SKATER_POSITIONS.filter((each) => next.has(each)));
  }

  useDefault(): void {
    this.positionsChanged.emit(null);
  }

  resetAll(): void {
    this.allReset.emit();
  }
}
