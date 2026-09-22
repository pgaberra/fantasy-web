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
  readonly filledCount = input.required<number>();
  readonly totalSlots = input.required<number>();
}
