import { Component, computed, input, output } from '@angular/core';
import { SKATER_POSITIONS, SkaterPosition } from '../../../models/position.model';

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
  templateUrl: './position-menu.html',
  styleUrl: './position-menu.css',
})
export class PositionMenuComponent {
  readonly playerName = input.required<string>();
  readonly positions = input.required<ReadonlySet<SkaterPosition>>();
  /** Whether these positions are the owner's correction rather than the reported ones. */
  readonly overridden = input<boolean>(false);

  /** The new positions, or null to go back to the ones the player pool reports. */
  readonly positionsChanged = output<SkaterPosition[] | null>();

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
}
