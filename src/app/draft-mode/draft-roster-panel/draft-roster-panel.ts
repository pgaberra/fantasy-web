import { Component, inject, input, output } from '@angular/core';
import { DraftState } from '../../api/models/draft-state';
import { DerivedRoster } from '../draft-roster.service';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar';

@Component({
  selector: 'app-draft-roster-panel',
  imports: [PlayerAvatarComponent],
  templateUrl: './draft-roster-panel.html',
  styleUrl: './draft-roster-panel.css',
})
export class DraftRosterPanelComponent {
  readonly lookup = inject(DraftPlayerLookupService);

  readonly roster = input.required<DerivedRoster>();
  readonly teams = input.required<DraftState['teams']>();
  readonly effectiveTeamId = input.required<string | null>();
  readonly filledCount = input.required<number>();
  readonly totalSlots = input.required<number>();
  readonly teamSelected = output<string>();

  onSelect(event: Event): void {
    this.teamSelected.emit((event.target as HTMLSelectElement).value);
  }
}
