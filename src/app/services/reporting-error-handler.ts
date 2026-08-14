import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ErrorReportingService } from './error-reporting.service';

/**
 * Reports uncaught errors, then hands them to Angular's default handler so they still reach the
 * console. Reporting replaces nothing a developer relies on locally — where the DSN is empty and
 * this is inert anyway.
 */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly reporting = inject(ErrorReportingService);

  override handleError(error: unknown): void {
    // A failed report must never swallow the error it was reporting.
    try {
      this.reporting.report(error);
    } catch {
      // Deliberately empty: if Sentry itself throws there is nowhere left to report it, and the
      // original error below is the one that matters.
    }
    super.handleError(error);
  }
}
