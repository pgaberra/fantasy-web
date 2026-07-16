import { Injectable } from '@angular/core';
import { ProjectionData } from '../api/models/projection-data';

const STORAGE_KEY = 'slapstat.pending-projection';

/**
 * Carries a projection edited in the landing-page demo across the sign-up / sign-in
 * redirect, so that work isn't thrown away by the navigation.
 *
 * sessionStorage rather than an in-memory signal, so it also survives a reload of the auth
 * page; tab-scoped and cleared the moment it's redeemed. Deliberately storage-only (no HTTP
 * or router dependencies) so `AuthService` and others can depend on it freely.
 */
@Injectable({ providedIn: 'root' })
export class PendingProjectionService {
  stash(data: ProjectionData): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full, or blocked by a privacy mode. The demo edits simply aren't carried
      // over — the same as before this existed. Never block the sign-up over it.
    }
  }

  peek(): ProjectionData | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ProjectionData) : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do — a stale entry is harmless, it is only read once.
    }
  }
}
