import { Component, model } from '@angular/core';
import { RosterSlots } from '../../api/models/roster-slots';

/**
 * Editable grid of roster slot counts per position. Two-way bound via `rosterSlots`.
 * Reused by the projection settings (category leagues), the League setup menu and the draft setup.
 *
 * Deliberately unlabelled: each host heads it in its own idiom — an uppercase section heading in
 * the League setup popover, a setting name in the settings panel — and the draft setup already
 * labelled it itself, so a title of its own only ever collided with theirs.
 */
@Component({
  selector: 'app-roster-slots-editor',
  templateUrl: './roster-slots-editor.html',
  styleUrl: './roster-slots-editor.css',
})
export class RosterSlotsEditorComponent {
  readonly rosterSlots = model.required<RosterSlots>();

  protected readonly ROSTER_POSITIONS: { key: keyof RosterSlots; label: string }[] = [
    { key: 'c', label: 'C' },
    { key: 'lw', label: 'LW' },
    { key: 'rw', label: 'RW' },
    { key: 'd', label: 'D' },
    { key: 'util', label: 'Util' },
    { key: 'bn', label: 'BN' },
    { key: 'g', label: 'G' },
  ];

  onRosterSlotInput(position: keyof RosterSlots, event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(50, Math.max(0, Math.round(parsed)));
      this.rosterSlots.update((slots) => ({ ...slots, [position]: clamped }));
    }
  }
}
