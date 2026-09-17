import { Injectable, signal } from '@angular/core';
import type { CaptureResult, PostHog, Properties } from 'posthog-js';
import { environment } from '../../environments/environment';
import { redactUrl } from '../shared/redact-url';

/**
 * Business events worth measuring — the funnel we'll want in PostHog once there's traffic.
 * A union so call sites can't drift into `projectionCreated` next to `projection_created`.
 */
export type AnalyticsEvent =
  | 'user_registered'
  | 'projection_created'
  | 'draft_started'
  | 'projection_shared'
  | 'shared_projection_viewed'
  | 'shared_projection_imported'
  | 'projection_spreadsheet_imported';

/** Mirrors posthog's `get_explicit_consent_status()`. */
export type ConsentDecision = 'granted' | 'denied' | 'pending';

/**
 * Where posthog stores the consent decision. Named explicitly because the default
 * (`__ph_opt_in_out_<project token>`) varies per environment — a stable key lets the E2E
 * suite pre-decline consent without knowing which PostHog project it's running against.
 * Values are posthog's own: '1' granted, '0' denied, absent means pending.
 */
export const CONSENT_STORAGE_KEY = 'slapstat_analytics_consent';

/**
 * Redacts every string property that happens to be a URL, rather than allowlisting the
 * known URL-bearing keys ($current_url, $referrer, $initial_current_url, …). A future
 * posthog property or a new token-bearing route then can't quietly reintroduce the leak.
 */
function redactProperties(properties: Properties | undefined): void {
  if (!properties) {
    return;
  }
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') {
      properties[key] = redactUrl(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      redactProperties(value as Properties);
    }
  }
}

/** Exported for tests — this is the one piece of analytics code with a security consequence. */
export function redactEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) {
    return null;
  }
  redactProperties(event.properties);
  redactProperties(event.$set);
  redactProperties(event.$set_once);
  return event;
}

/**
 * The app's only entry point to PostHog — nothing else may import `posthog-js`.
 *
 * Off unless `environment.posthogKey` is set, mirroring how an empty `googleClientId` hides
 * the Google button and an unset `SENTRY_DSN` makes Sentry inert: local dev, tests and any
 * build without the key never even fetch the library.
 *
 * Consent runs in PostHog's `on_reject` cookieless mode. While the banner is unanswered
 * posthog is already cookieless (`isOptedOut()` is true for a pending decision in that
 * mode), so no cookie is set before the user chooses; declining keeps them counted via a
 * server-side daily hash instead, so declining doesn't distort the visitor numbers.
 *
 * NOTE: cookieless mode must also be enabled in the PostHog *project settings*, or every
 * cookieless event — i.e. everyone who declines — is silently discarded server-side.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly enabled = environment.posthogKey !== '';
  private client: PostHog | null = null;

  /**
   * Remembered so a sign-in that lands before the consent decision isn't lost. Pageviews are
   * still captured while consent is pending (cookielessly), but an identify is not: a
   * distinct id is personal data, which is exactly what cookieless mode exists to avoid. So
   * the identify has to be replayed once the user opts in.
   */
  private currentUserId: string | null = null;

  /**
   * The banner reads this. Null while analytics is disabled or posthog is still loading —
   * both cases mean "render nothing".
   */
  readonly consentDecision = signal<ConsentDecision | null>(null);

  /**
   * Loads and starts posthog. Deliberately not awaited by the app initializer: bootstrap
   * must never block on analytics.
   *
   * posthog-js is imported dynamically to keep ~250 kB out of the initial bundle — a static
   * import puts the app within a few kB of the 1 MB `initial` budget error in angular.json.
   */
  async init(): Promise<void> {
    if (!this.enabled || this.client) {
      return;
    }

    const { default: posthog } = await import('posthog-js');

    posthog.init(environment.posthogKey, {
      // Same-origin proxy (see nginx.conf): keeps the CSP at 'self' and stops ad blockers
      // from silently dropping an unknown share of the traffic we're trying to measure.
      api_host: `${window.location.origin}/ingest`,
      ui_host: 'https://eu.posthog.com',
      cookieless_mode: 'on_reject',
      consent_persistence_name: CONSENT_STORAGE_KEY,
      // Baseline recommended snapshot; later dates include all earlier changes. The flags
      // below are set explicitly anyway — the privacy surface shouldn't hinge on what a
      // version bump decides this string means.
      defaults: '2026-06-25',
      person_profiles: 'identified_only',
      // Autocapture records clicked element text, i.e. page content. That's a step-2
      // decision with its own privacy review, not something to switch on by default.
      autocapture: false,
      capture_pageleave: true,
      // Replay is likewise a later, deliberate step. Setting it here rather than relying on
      // the project toggle means enabling it takes a reviewable PR, not a click in an UI.
      disable_session_recording: true,
      before_send: redactEvent,
    });

    this.client = posthog;

    if (this.currentUserId) {
      posthog.identify(this.currentUserId);
    }
    this.consentDecision.set(posthog.get_explicit_consent_status());
  }

  optIn() {
    if (!this.client) {
      return;
    }
    this.client.opt_in_capturing();
    // An identify before this point was dropped (see currentUserId), so re-run it.
    if (this.currentUserId) {
      this.client.identify(this.currentUserId);
    }
    this.consentDecision.set(this.client.get_explicit_consent_status());
  }

  optOut() {
    if (!this.client) {
      return;
    }
    this.client.opt_out_capturing();
    this.consentDecision.set(this.client.get_explicit_consent_status());
  }

  /**
   * `userId` is the account UUID from the JWT's `sub` claim — never the email, which sits in
   * the same token payload and would stamp PII onto every event row.
   */
  identify(userId: string) {
    this.currentUserId = userId;
    this.client?.identify(userId);
  }

  reset() {
    this.currentUserId = null;
    this.client?.reset();
  }

  capture(event: AnalyticsEvent, properties?: Record<string, string | number | boolean>) {
    this.client?.capture(event, properties);
  }
}
