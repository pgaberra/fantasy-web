import { Injectable, signal } from '@angular/core';

/** Which platform a chosen league belongs to, in the BFF's own spelling. */
export type LeaguePlatform = 'YAHOO' | 'ESPN';

export interface ChosenLeague {
  platform: LeaguePlatform;
  /** Yahoo's league key, or the ESPN league id. */
  leagueId: string;
  name: string;
}

const STORAGE_KEY = 'slapstat.league';
/** Where the Streamer Planner kept its league before every picker shared one. */
const PLANNER_STORAGE_KEY = 'slapstat.streamerPlanner.league';

/**
 * The league the user last chose, on whichever page they chose it, remembered on this device.
 *
 * <p>A manager looking at a league in one place almost always wants the same league in the next,
 * so every league picker opens on this one and every choice made in one of them is written back
 * (Alexander's call, 2026-10-05). It is a starting point, never a lock: a page that is about one
 * league already — a board synced from a league, a draft opened from a link — keeps its own, and
 * a Yahoo league the account no longer lists is let go of rather than opened on.
 *
 * <p>Kept on this device rather than on the account: it is a convenience, and losing it costs one
 * dropdown, so a browser that refuses storage is left with the pickers.
 */
@Injectable({ providedIn: 'root' })
export class LeagueChoiceService {
  readonly league = signal<ChosenLeague | null>(read());

  choose(league: ChosenLeague): void {
    this.league.set(league);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(league));
      localStorage.removeItem(PLANNER_STORAGE_KEY);
    } catch {
      // A private window, or storage the browser refuses: the choice still holds for this visit.
    }
  }

  forget(): void {
    this.league.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PLANNER_STORAGE_KEY);
    } catch {
      // Nothing to clean up if it was never written.
    }
  }

  /** The remembered league, where it is on the platform asked about. */
  on(platform: LeaguePlatform): ChosenLeague | null {
    const league = this.league();
    return league?.platform === platform ? league : null;
  }
}

/** Last time's league, or the planner's from before there was one for every page. */
function read(): ChosenLeague | null {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(PLANNER_STORAGE_KEY) ?? 'null',
    );
    if (!stored || typeof stored !== 'object') {
      return null;
    }
    const league = stored as Partial<ChosenLeague>;
    const platform = league.platform === 'ESPN' ? 'ESPN' : 'YAHOO';
    return league.leagueId
      ? { platform, leagueId: league.leagueId, name: league.name ?? league.leagueId }
      : null;
  } catch {
    return null;
  }
}
