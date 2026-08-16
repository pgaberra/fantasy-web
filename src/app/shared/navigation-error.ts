import { inject } from '@angular/core';
import { NotificationService } from '../services/notification.service';

/**
 * Set once we have already reloaded for a missing chunk, so a build that is genuinely broken
 * cannot put the tab in a reload loop. Cleared on the next navigation that works.
 */
const RELOADED_KEY = 'slapstat_reloaded_for_stale_build';

/**
 * Every route is lazily loaded, so a tab that was open across a deploy asks for chunk filenames
 * that no longer exist. The import rejects, the navigation dies, and — without this — the page
 * simply stays where it was: a form that had already succeeded, still spinning, with nothing said.
 */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /chunkloaderror|dynamically imported module|importing a module script failed/i.test(
    message,
  );
}

/**
 * Runs in an injection context (Angular calls it that way), so it can reach the notification
 * service — which reports to Sentry as well as rendering, meaning a navigation that dies is no
 * longer invisible to us either.
 */
export function handleNavigationError(error: unknown): void {
  if (isStaleBuildError(error)) {
    if (!sessionStorage.getItem(RELOADED_KEY)) {
      sessionStorage.setItem(RELOADED_KEY, '1');
      location.reload();
      return;
    }
    // Reloading did not help, so the build is broken rather than merely stale. Say so instead of
    // reloading again.
    inject(NotificationService).error(
      "Couldn't load that page. Please refresh — a new version may have just been released.",
    );
    return;
  }

  inject(NotificationService).error("Couldn't open that page. Please try again.");
}

/** Called after a navigation succeeds, so a later deploy is allowed its one reload. */
export function clearStaleBuildReload(): void {
  sessionStorage.removeItem(RELOADED_KEY);
}
