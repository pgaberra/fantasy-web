import { Component, inject, input } from '@angular/core';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';

/**
 * A player's positions as coloured chips, the one way the draft board shows them. Once the
 * avatar's colour was a player's position in the pick feed and the results; with the avatars
 * hidden while no player has a picture, these chips are what says it in every panel.
 */
@Component({
  selector: 'app-position-chips',
  template: `@for (position of lookup.positions(playerId()); track position) {
    <span [class]="'pos-chip pos--' + position.toLowerCase()">{{ position }}</span>
  }`,
  styleUrl: './position-chips.css',
})
export class PositionChipsComponent {
  protected readonly lookup = inject(DraftPlayerLookupService);

  readonly playerId = input.required<number>();
}
