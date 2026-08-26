import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ErrorReportingService } from './error-reporting.service';
import { ReportingErrorHandler } from './reporting-error-handler';
import { RELOADED_KEY } from '../shared/navigation-error';

describe('ReportingErrorHandler', () => {
  let report: ReturnType<typeof vi.fn>;
  let handler: ReportingErrorHandler;

  beforeEach(() => {
    report = vi.fn();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [ReportingErrorHandler, { provide: ErrorReportingService, useValue: { report } }],
    });
    handler = TestBed.inject(ReportingErrorHandler);
  });

  afterEach(() => {
    sessionStorage.clear();
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

  /**
   * The router rethrows after its navigation error handler has already reloaded for the missing
   * chunk, so this error arrives for a failure that is being fixed as it is reported.
   */
  it('does not report a stale-build error the app is already reloading for', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem(RELOADED_KEY, '1');

    handler.handleError(new Error('Failed to fetch dynamically imported module: /chunk-A.js'));

    expect(report).not.toHaveBeenCalled();
  });

  it('reports a stale-build error that no reload was scheduled for', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Failed to fetch dynamically imported module: /chunk-A.js');

    handler.handleError(error);

    expect(report).toHaveBeenCalledWith(error);
  });

  it('still logs the stale-build error it does not report', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem(RELOADED_KEY, '1');

    handler.handleError(new Error('Importing a module script failed.'));

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
