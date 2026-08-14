import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ErrorReportingService } from './error-reporting.service';
import { ReportingErrorHandler } from './reporting-error-handler';

describe('ReportingErrorHandler', () => {
  let report: ReturnType<typeof vi.fn>;
  let handler: ReportingErrorHandler;

  beforeEach(() => {
    report = vi.fn();
    TestBed.configureTestingModule({
      providers: [ReportingErrorHandler, { provide: ErrorReportingService, useValue: { report } }],
    });
    handler = TestBed.inject(ReportingErrorHandler);
  });

  it('reports an uncaught error', () => {
    const error = new Error('boom');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handler.handleError(error);

    expect(report).toHaveBeenCalledWith(error);
  });

  it('still logs the error after reporting it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handler.handleError(new Error('boom'));

    expect(consoleError).toHaveBeenCalled();
  });

  /** Reporting is a side errand. It must never be the reason an error goes unlogged. */
  it('logs the original error even when reporting throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    report.mockImplementation(() => {
      throw new Error('sentry is down');
    });

    expect(() => handler.handleError(new Error('boom'))).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
  });
});
