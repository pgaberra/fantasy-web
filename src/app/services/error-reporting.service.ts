import { Injectable } from '@angular/core';
import type { ErrorEvent, EventHint } from '@sentry/browser';
import { environment } from '../../environments/environment';
import { redactUrl } from '../shared/redact-url';
import { isRecoveringFromStaleBuild } from '../shared/stale-build';

type SentryApi = typeof import('@sentry/browser');

/**
 * How many reports to hold while the SDK is still loading. The import is dynamic, so the first
 * errors of a session — the ones that fire during bootstrap, and the most interesting ones —
 * would otherwise be dropped for arriving too early. Bounded so a failing app that throws in a
 * loop cannot grow this without limit.
 */
const MAX_PENDING = 20;

/** Exported for tests: this is the one piece with a privacy consequence. */
export function redactEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) {
    event.request.url = redactUrl(event.request.url);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.data) {
      for (const [key, value] of Object.entries(breadcrumb.data)) {
        if (typeof value === 'string') {
          breadcrumb.data[key] = redactUrl(value);
        }
      }
    }
  }
  return event;
}

/**
 * The last gate before an event goes on the wire, and the only one that sees every event.
 *
 * Sentry installs its own `error` and `unhandledrejection` listeners, which report straight past
 * Angular's `ErrorHandler` — so the stale-build filter in `ReportingErrorHandler` covered only one
 * of the two ways that error reaches Sentry. The router rethrows after scheduling the reload, the
 * rethrow surfaces as an unhandled rejection, and the global listener sent it regardless: the
 * alert kept firing on every deploy from the release that was supposed to have stopped it.
 * Filtering here catches both paths at once.
 */
export function beforeSendEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  // The SDK hands over what was actually thrown; the serialised value is the fallback for an
  // event that reached us without one.
  const thrown = hint?.originalException ?? event.exception?.values?.[0]?.value ?? '';
  if (isRecoveringFromStaleBuild(thrown)) {
    return null;
  }
  return redactEvent(event);
}

/**
 * The app's only entry point to Sentry — nothing else may import `@sentry/browser`.
 *
 * It exists because on 2026-08-13 a user lost a saved projection and the only reason anyone
 * found out was that they emailed a photograph of their screen a day later. The four backend
 * services have reported to Sentry for months; the browser reported nowhere, so a failure that
 * happened entirely client-side was invisible by construction.
 *
 * Off unless `environment.sentryDsn` is set, mirroring how an empty `posthogKey` disables
 * analytics: local dev, tests and any build without the DSN never fetch the SDK and send
 * nothing.
 */
@Injectable({
  providedIn: 'root',
})
export class ErrorReportingService {
  private readonly enabled = environment.sentryDsn !== '';
  private sentry: SentryApi | null = null;
  private pending: { error: unknown; hint?: EventHint }[] = [];
  private userId: string | null = null;

  /**
   * Loads and starts the SDK. Deliberately not awaited by the app initializer: bootstrap must
   * never block on error reporting, and it must never be the reason the app fails to start.
   *
   * The dynamic import keeps the SDK out of the initial bundle, which sits within a few kB of
   * the 1 MB budget error in angular.json — the same reason posthog-js is imported this way.
   */
  async init(): Promise<void> {
    if (!this.enabled || this.sentry) {
      return;
    }

    const sentry = await import('@sentry/browser');

    sentry.init({
      dsn: environment.sentryDsn,
      // Matches SENTRY_ENVIRONMENT on the Java services, so one project separates the two
      // deployments the same way on both sides.
      environment: environment.environmentName,
      release: environment.version || undefined,
      // Off for the same reason the backends keep their alerting narrow: a stream of
      // performance spans would bury the faults this exists to surface.
      tracesSampleRate: 0,
      beforeSend: beforeSendEvent,
    });

    this.sentry = sentry;
    if (this.userId) {
      sentry.setUser({ id: this.userId });
    }
    for (const { error, hint } of this.pending) {
      sentry.captureException(error, hint);
    }
    this.pending = [];
  }

  /**
   * `userId` is the account UUID from the JWT's `sub` claim — never the email, which sits in the
   * same token payload and would stamp PII onto every event.
   */
  identify(userId: string): void {
    this.userId = userId;
    this.sentry?.setUser({ id: userId });
  }

  reset(): void {
    this.userId = null;
    this.sentry?.setUser(null);
  }

  /** An exception worth a stack trace: an uncaught error, or a failure a caller already handled. */
  report(error: unknown, context?: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    const hint = context ? { captureContext: { extra: context } } : undefined;
    if (!this.sentry) {
      if (this.pending.length < MAX_PENDING) {
        this.pending.push({ error, hint });
      }
      return;
    }
    this.sentry.captureException(error, hint);
  }

  /**
   * A failure the app handled and explained to the user. It has no stack worth keeping, but it
   * is still a fault — a save that did not save is exactly what went unnoticed for a day.
   */
  reportMessage(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    this.sentry?.captureMessage(message, { level: 'error', extra: context });
  }
}
