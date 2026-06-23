import { Component, model } from '@angular/core';
import { SettingRowComponent } from '../setting-row/setting-row';
import { RosterSlots } from '../../../api/models/roster-slots';
import { DEFAULT_LEAGUE_SIZE, DEFAULT_ROSTER_SLOTS } from '../../projection-defaults';

@Component({
  selector: 'app-category-settings',
  templateUrl: './category-settings.html',
  styleUrl: './category-settings.css',
  imports: [SettingRowComponent],
})
export class CategorySettingsComponent {
  leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);

  protected readonly ROSTER_POSITIONS: { key: keyof RosterSlots; label: string }[] = [
    { key: 'c', label: 'C' },
    { key: 'lw', label: 'LW' },
    { key: 'rw', label: 'RW' },
    { key: 'd', label: 'D' },
    { key: 'util', label: 'Util' },
    { key: 'bn', label: 'BN' },
    { key: 'g', label: 'G' },
  ];

  onLeagueSizeInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.leagueSize.set(Math.min(30, Math.max(2, Math.round(parsed))));
    }
  }

  onRosterSlotInput(position: keyof RosterSlots, event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(50, Math.max(0, Math.round(parsed)));
      this.rosterSlots.update((slots) => ({ ...slots, [position]: clamped }));
    }
  }
}
