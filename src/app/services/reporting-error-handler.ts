import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ErrorReportingService } from './error-reporting.service';
import { isRecoveringFromStaleBuild } from '../shared/navigation-error';

/**
 * Reports uncaught errors, then hands them to Angular's default handler so they still reach the
 * console. Reporting replaces nothing a developer relies on locally — where the DSN is empty and
 * this is inert anyway.
 */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly reporting = inject(ErrorReportingService);

  override handleError(error: unknown): void {
    // The one error worth not reporting: a tab that outlived the build it started on, which the
    // router has already handled by reloading. It arrives here because the router rethrows after
    // calling the navigation error handler, and it is not a fault — every deploy raised an alert
    // for it. It still reaches the console below, and a build that is broken rather than merely
    // stale reports through the notification the navigation handler shows instead.
    if (!isRecoveringFromStaleBuild(error)) {
      // A failed report must never swallow the error it was reporting.
      try {
        this.reporting.report(error);
      } catch {
        // Deliberately empty: if Sentry itself throws there is nowhere left to report it, and the
        // original error below is the one that matters.
      }
    }
    super.handleError(error);
  }
}
