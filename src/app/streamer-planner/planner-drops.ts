/**
 * The players a manager would drop for a pickup, remembered per league. It is his own call, made
 * once and changed now and then, not every visit; until he makes it the page suggests some, and
 * the suggestion is not stored, so it keeps following the roster.
 */
const STORAGE_KEY = 'slapstat.streamerPlanner.drops';

type StoredDropsByLeague = Record<string, readonly string[]>;

/** The player ids picked as drops in a league, or null when none have been picked there. */
export function readDrops(league: string): readonly string[] | null {
  return readAll()[league] ?? null;
}

/** The drops picked in a league, kept until changed. Null forgets them: the suggestion again. */
export function writeDrops(league: string, playerIds: readonly string[] | null): void {
  const all = { ...readAll() };
  if (playerIds) {
    all[league] = [...playerIds];
  } else {
    delete all[league];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // A private window, or storage the browser refuses: the choice still holds for this visit.
  }
}

function readAll(): StoredDropsByLeague {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored as Record<string, unknown>).filter(
        ([, ids]) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
      ),
    ) as StoredDropsByLeague;
  } catch {
    return {};
  }
}
