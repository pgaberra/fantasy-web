/**
 * Query parameters that must never leave the browser.
 *
 * `/reset-password?token=…` and `/verify-email?token=…` carry live single-use account tokens,
 * and anything that stamps the current URL onto what it sends — PostHog onto `$current_url`,
 * Sentry onto an event's request context — would carry the token with it. Unredacted, a
 * password-reset token would sit in a third-party dashboard before its owner had clicked the
 * link.
 *
 * Add to this list when a route gains a sensitive query param, and keep the redaction general
 * rather than allowlisting the routes that happen to use one today.
 */
export const REDACTED_QUERY_PARAMS = ['token'];

const REDACTED = 'redacted';

/** Rewrites sensitive query params out of any string that parses as a URL. */
export function redactUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  let changed = false;
  for (const param of REDACTED_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.set(param, REDACTED);
      changed = true;
    }
  }
  return changed ? url.toString() : value;
}
