import { Injectable } from '@angular/core';
import { Player } from '../models/player.model';
import { RosterSlots } from '../api/models/roster-slots';

export interface RosterSlot {
  id: string;
  slotKey: keyof RosterSlots;
  label: string;
  playerId: number | null;
}

export interface DerivedRoster {
  slots: RosterSlot[];
  /** Players drafted to my team that did not fit any eligible slot. */
  unplaced: number[];
}

const SLOT_ORDER: { key: keyof RosterSlots; label: string }[] = [
  { key: 'c', label: 'C' },
  { key: 'lw', label: 'LW' },
  { key: 'rw', label: 'RW' },
  { key: 'd', label: 'D' },
  { key: 'util', label: 'Util' },
  { key: 'g', label: 'G' },
  { key: 'bn', label: 'BN' },
];

@Injectable({ providedIn: 'root' })
export class DraftRosterService {
  /**
   * Auto-places drafted players (in pick order) into a roster built from the projection's slots.
   * Each player takes the first open eligible slot; players that do not fit land in `unplaced`.
   */
  deriveRoster(
    minePicks: number[],
    players: Map<number, Player>,
    rosterSlots: RosterSlots,
  ): DerivedRoster {
    const slots: RosterSlot[] = [];
    for (const { key, label } of SLOT_ORDER) {
      for (let index = 0; index < rosterSlots[key]; index++) {
        slots.push({ id: `${key}-${index}`, slotKey: key, label, playerId: null });
      }
    }

    const unplaced: number[] = [];
    for (const playerId of minePicks) {
      const player = players.get(playerId);
      if (!player) {
        unplaced.push(playerId);
        continue;
      }
      const open = this.eligibleSlotKeys(player)
        .map((slotKey) => slots.find((slot) => slot.slotKey === slotKey && slot.playerId === null))
        .find((slot) => slot !== undefined);
      if (open) {
        open.playerId = playerId;
      } else {
        unplaced.push(playerId);
      }
    }

    return { slots, unplaced };
  }

  /** Slot keys a player is eligible for, in placement priority (specific positions → util → bench). */
  private eligibleSlotKeys(player: Player): (keyof RosterSlots)[] {
    if (player.type === 'goalie') {
      return ['g', 'bn'];
    }
    const keys: (keyof RosterSlots)[] = [];
    if (player.positions.has('C')) keys.push('c');
    if (player.positions.has('LW')) keys.push('lw');
    if (player.positions.has('RW')) keys.push('rw');
    if (player.positions.has('D')) keys.push('d');
    keys.push('util', 'bn');
    return keys;
  }
}
