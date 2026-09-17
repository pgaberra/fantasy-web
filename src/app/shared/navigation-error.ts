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
  // The toast's sentence is all a report would otherwise carry, so the event could not say which
  // chunk failed or why: a deploy caught mid-swap and a genuinely broken build read the same.
  const cause = { cause: error instanceof Error ? error.message : String(error) };
  if (isStaleBuildError(error)) {
    if (!sessionStorage.getItem(RELOADED_KEY)) {
      sessionStorage.setItem(RELOADED_KEY, '1');
      location.reload();
      return;
    }
    // Reloading did not help. Either the build is broken, or the reload landed mid-deploy, while
    // the old and new containers both still answer, and fetched an old page whose chunks the new
    // container does not have. Say so instead of reloading again.
    inject(NotificationService).error(
      "Couldn't load that page. Please refresh and try again.",
      cause,
    );
    return;
  }

  inject(NotificationService).error("Couldn't open that page. Please try again.", cause);
}
