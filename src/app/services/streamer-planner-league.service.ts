import { Injectable, signal } from '@angular/core';

/** Which platform a planner league belongs to, in the BFF's own spelling. */
export type PlannerPlatform = 'YAHOO' | 'ESPN';

export interface PlannerLeague {
  platform: PlannerPlatform;
  /** Yahoo's league key, or the ESPN league id. */
  leagueId: string;
  name: string;
}

const STORAGE_KEY = 'slapstat.streamerPlanner.league';

/**
 * The league the planner reads free agents from, remembered on this device.
 *
 * <p>It is kept here rather than on a projection: the planner is about a league's wire, and a
 * manager who has not built a projection for that league still has free agents to pick from.
 * Losing it costs one dropdown, so a browser that refuses storage is left with the picker.
 */
@Injectable({ providedIn: 'root' })
export class StreamerPlannerLeagueService {
  readonly league = signal<PlannerLeague | null>(read());

  choose(league: PlannerLeague): void {
    this.league.set(league);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(league));
    } catch {
      // A private window, or storage the browser refuses: the choice still holds for this visit.
    }
  }

  forget(): void {
    this.league.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if it was never written.
    }
  }
}

function read(): PlannerLeague | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') {
      return null;
    }
    const league = stored as Partial<PlannerLeague>;
    const platform = league.platform === 'ESPN' ? 'ESPN' : 'YAHOO';
    return league.leagueId
      ? { platform, leagueId: league.leagueId, name: league.name ?? league.leagueId }
      : null;
  } catch {
    return null;
  }
}
