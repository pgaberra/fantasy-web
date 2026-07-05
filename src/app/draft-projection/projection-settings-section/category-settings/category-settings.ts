import { Component, model } from '@angular/core';
import { SettingRowComponent } from '../setting-row/setting-row';
import { RosterSlots } from '../../../api/models/roster-slots';
import { DEFAULT_LEAGUE_SIZE, DEFAULT_ROSTER_SLOTS } from '../../projection-defaults';
import { RosterSlotsEditorComponent } from '../../../shared/roster-slots-editor/roster-slots-editor';

@Component({
  selector: 'app-category-settings',
  templateUrl: './category-settings.html',
  styleUrl: './category-settings.css',
  imports: [SettingRowComponent, RosterSlotsEditorComponent],
})
export class CategorySettingsComponent {
  leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);

  onLeagueSizeInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.leagueSize.set(Math.min(30, Math.max(2, Math.round(parsed))));
    }
  }
}
