import { Component, inject, input } from '@angular/core';
import { DerivedRoster } from '../draft-roster.service';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar';
import { PlayerPositionChipsComponent } from '../player-position-chips/player-position-chips';

@Component({
  selector: 'app-draft-roster-panel',
  imports: [PlayerAvatarComponent, PlayerPositionChipsComponent],
  templateUrl: './draft-roster-panel.html',
  styleUrl: './draft-roster-panel.css',
})
export class DraftRosterPanelComponent {
  readonly lookup = inject(DraftPlayerLookupService);

  readonly roster = input.required<DerivedRoster>();
  /** The players the user has drafted, including those with no slot left, listed as Extra. */
  readonly draftedCount = input.required<number>();
  readonly totalSlots = input.required<number>();
}
