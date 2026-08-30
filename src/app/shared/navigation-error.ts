import { inject } from '@angular/core';
import { NotificationService } from '../services/notification.service';
import { isStaleBuildError, RELOADED_KEY } from './stale-build';

// Re-exported so the router wiring stays the one import site callers reach for; the predicates
// themselves live in stale-build.ts, which Sentry's beforeSend can reach without a module cycle.
export {
  clearStaleBuildReload,
  isRecoveringFromStaleBuild,
  isStaleBuildError,
  RELOADED_KEY,
} from './stale-build';

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
      "Couldn't load that page. Please refresh. A new version may have just been released.",
    );
    return;
  }

  inject(NotificationService).error("Couldn't open that page. Please try again.");
}
