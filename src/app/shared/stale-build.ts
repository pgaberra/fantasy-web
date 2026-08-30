/**
 * Recognising the error a tab throws when the build it started on has been replaced, kept apart
 * from the router wiring in `navigation-error.ts` because two very different places need it: the
 * navigation error handler, and Sentry's own `beforeSend`. The latter runs inside
 * `ErrorReportingService`, and reaching back into the router file from there would close a
 * module cycle through `NotificationService`. Nothing in here touches Angular.
 */

/**
 * Set once we have already reloaded for a missing chunk, so a build that is genuinely broken
 * cannot put the tab in a reload loop. Cleared on the next navigation that works. Exported so a
 * test asserting that nothing was reported cannot pass by writing the wrong key.
 */
export const RELOADED_KEY = 'slapstat_reloaded_for_stale_build';

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
 * True for the stale-build error of a navigation we are already reloading for. The router calls
 * the navigation error handler and *then* rethrows, so the same error is seen again — twice over,
 * in fact: once by Angular's `ErrorHandler`, and once by Sentry's own global listener when the
 * rethrow surfaces as an unhandled rejection. Reporting it from either made every deploy raise a
 * Sentry alert for a failure the user never saw and the reload had already fixed. The build that
 * is broken rather than stale still reports: the second time through, the navigation handler
 * shows (and reports) a notification instead of reloading again.
 */
export function isRecoveringFromStaleBuild(error: unknown): boolean {
  return isStaleBuildError(error) && sessionStorage.getItem(RELOADED_KEY) !== null;
}

/** Called after a navigation succeeds, so a later deploy is allowed its one reload. */
export function clearStaleBuildReload(): void {
  sessionStorage.removeItem(RELOADED_KEY);
}
