import { Component, inject, input } from '@angular/core';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';

/**
 * A player's positions as coloured chips, looked up by id in the draft pool. Once the avatar's
 * colour was a player's position in the pick feed and the results; with the avatars hidden while
 * no player has a picture, these chips are what says it in every panel.
 */
@Component({
  selector: 'app-player-position-chips',
  imports: [PositionChipsComponent],
  template: `<app-position-chips [positions]="lookup.positions(playerId())" />`,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
  `,
})
export class PlayerPositionChipsComponent {
  protected readonly lookup = inject(DraftPlayerLookupService);

  readonly playerId = input.required<number>();
}
