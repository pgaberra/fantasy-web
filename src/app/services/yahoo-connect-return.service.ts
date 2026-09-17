import { Injectable } from '@angular/core';

const STORAGE_KEY = 'slapstat.yahoo-connect-return';
const MAX_PATH_LENGTH = 2048;

/**
 * Remembers the page a user's own Yahoo connect started from, so the claim on the way back can
 * return there instead of to projections.
 *
 * Yahoo's consent is a full-page round trip through Yahoo and yahoo-service in the same tab, so
 * the tab's sessionStorage is still there when the callback sends the browser back to the landing
 * route. Only an app path is ever handed back: anything that is not a single leading slash (a
 * scheme, a protocol-relative `//host`, a `/\host` that browsers read as one) is dropped, so the
 * stored value can never turn into a redirect off the site. Storage-only, like
 * `PendingProjectionService`, so a guard can depend on it freely.
 *
 * The page alone is not where the connect started: it started in the import dialog, which is
 * page state the round trip reloads away. So the page handed back is also held in memory until
 * that page asks, once, whether it is the one being returned to, and opens the dialog again.
 */
@Injectable({ providedIn: 'root' })
export class YahooConnectReturnService {
  /** The page `take` last handed back, until that page claims it with `returnedTo`. */
  private handedBack: string | null = null;

  remember(path: string): void {
    try {
      if (isAppPath(path)) {
        sessionStorage.setItem(STORAGE_KEY, path);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage blocked by a privacy mode: the connect still works and lands on projections.
    }
  }

  /** The remembered path, if it is still a safe app path; read once and cleared. */
  take(): string | null {
    let path: string | null = null;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      path = stored !== null && isAppPath(stored) ? stored : null;
    } catch {
      // Storage blocked: nothing was remembered, so nothing is handed back.
    }
    this.handedBack = path;
    return path;
  }

  /**
   * Whether `url` is the page a connect has just come back to, answered true once. Only this app
   * instance's own hand-back counts, never storage, so a reload later on does not reopen anything.
   */
  returnedTo(url: string): boolean {
    if (this.handedBack !== url) {
      return false;
    }
    this.handedBack = null;
    return true;
  }

  forget(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do: an entry that cannot be removed cannot be read either.
    }
  }
}

function isAppPath(path: string): boolean {
  return (
    path.length <= MAX_PATH_LENGTH &&
    path.startsWith('/') &&
    path[1] !== '/' &&
    path[1] !== '\\' &&
    // Control characters (a tab or newline inside `/\t/host`) are stripped by URL parsers.
    ![...path].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
  );
}
