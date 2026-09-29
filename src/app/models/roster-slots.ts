import { RosterSlots } from '../api/models/roster-slots';

/**
 * Every skater slot a team fills, flex and bench included: the size of the skater pool a category
 * z-score is measured against, per team.
 */
export function skaterSlotCount(roster: RosterSlots): number {
  return (
    roster.c + roster.lw + roster.rw + roster.w + roster.f + roster.d + roster.util + roster.bn
  );
}

/**
 * Roster slots written before the wing (W) and forward (F) flex slots existed have no such keys,
 * which would make every sum over them NaN. They read as none, as they do on the server.
 */
export function withFlexSlots(
  roster: Omit<RosterSlots, 'w' | 'f'> & Partial<RosterSlots>,
): RosterSlots {
  return { ...roster, w: roster.w ?? 0, f: roster.f ?? 0 };
}
