import { ScoringStatKey, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';

/**
 * The skater categories a streamer is chasing this week, remembered per league until the week is
 * over. A category matchup is usually settled in most categories by Friday, and the add that
 * matters is the one that swings the few still open; which those are is next week's question, so
 * the choice is let go of when the week ends rather than carried silently into it.
 */
const STORAGE_KEY = 'slapstat.streamerPlanner.focus';

interface StoredFocus {
  readonly categories: readonly string[];
  /** The last day the choice holds: the Sunday of the week it was made in. */
  readonly until: string;
}

type StoredFocusByLeague = Record<string, StoredFocus>;

const SKATER_KEYS: ReadonlySet<string> = new Set(SKATER_SCORING_STAT_KEYS);

/** The skater categories among a league's, in the league's order: the ones a focus can pick. */
export function focusableCategories(
  categories: readonly ScoringStatKey[],
): readonly ScoringStatKey[] {
  return categories.filter((key) => SKATER_KEYS.has(key));
}

/** The categories remembered for a league, or none once the week they were picked in is over. */
export function readFocus(league: string, today: string): readonly ScoringStatKey[] {
  const stored = readAll()[league];
  if (!stored || today > stored.until) {
    return [];
  }
  return stored.categories.filter((key): key is ScoringStatKey => SKATER_KEYS.has(key));
}

/**
 * The categories picked for a league, held until the end of the week. Nothing picked forgets the
 * league, and so does every week that has already ended, so the store never outgrows the leagues
 * in use this week.
 */
export function writeFocus(
  league: string,
  categories: ReadonlySet<ScoringStatKey>,
  until: string,
  today: string,
): void {
  const all = Object.fromEntries(
    Object.entries(readAll()).filter(([key, stored]) => key !== league && today <= stored.until),
  );
  if (categories.size > 0) {
    all[league] = { categories: [...categories], until };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // A private window, or storage the browser refuses: the choice still holds for this visit.
  }
}

function readAll(): StoredFocusByLeague {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored as Record<string, unknown>).filter(([, value]) => isStoredFocus(value)),
    ) as StoredFocusByLeague;
  } catch {
    return {};
  }
}

function isStoredFocus(value: unknown): value is StoredFocus {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const focus = value as Partial<StoredFocus>;
  return (
    typeof focus.until === 'string' &&
    Array.isArray(focus.categories) &&
    focus.categories.every((key) => typeof key === 'string')
  );
}
