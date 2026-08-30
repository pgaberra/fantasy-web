export const environment = {
  production: false,
  environmentName: 'development' as string,
  version: 'local' as string,
  rootUrl: 'http://localhost:8080',
  apiUrl: 'http://localhost:8080/api/v1',
  // Public Google OAuth Client ID (not a secret — shipped to the browser by design).
  // The same client allows the http://localhost:4200 JS origin, so local dev works.
  googleClientId: '404846934195-2840u7mkdapmstllgsiaft2gdgjb2c0g.apps.googleusercontent.com',
  // Public Facebook App ID (not a secret). Empty until a Meta app exists — that hides the
  // "Continue with Facebook" button. To test locally, set your dev app id (with localhost
  // allowed) AND set facebookLoginEnabled below to true.
  facebookAppId: '',
  // Feature toggle for the "Continue with Facebook" button. Off by default — the button shows
  // only when this is true and a facebookAppId is set. Deployed builds drive it via the
  // FACEBOOK_LOGIN_ENABLED build arg (see environment.prod.ts).
  facebookLoginEnabled: false,
  // Public PostHog project key (not a secret). Empty disables analytics entirely — see
  // AnalyticsService. Left empty in dev so local browsing never lands in the real stats.
  posthogKey: '',
  // Sentry DSN for browser error reporting (not a secret — it is shipped to every visitor
  // by design; it only permits sending events). Empty disables reporting entirely, so local
  // dev and tests never load the SDK — see ErrorReportingService.
  sentryDsn: '',
  // Manual off-season switch. When true the Yahoo league-sync UI shows an off-season note
  // instead of its controls (see YahooLeagueSyncComponent). Off in local dev; the deployed
  // builds inject it via the YAHOO_SYNC_DISABLED build arg.
  yahooSyncDisabled: false,
  // Subscription billing. Off by default; deployed builds drive it via the PAYMENTS_ENABLED
  // build arg. When false the pricing/account routes redirect away and no entitlement is fetched.
  paymentsEnabled: false,
  // Feature toggle for ESPN league sync (the ESPN option in the projection's league-sync UI).
  // Off by default; deployed builds drive it via the ESPN_LEAGUES_ENABLED build arg. Mirrors the
  // facebookLoginEnabled pattern — the ESPN provider stays hidden until this is true.
  espnLeaguesEnabled: false,
  // Feature toggle for the Who's hot page (its nav links and its route). On by default, unlike
  // the toggles above: the page already ships, so an unset flag has to mean "carry on showing
  // it". Deployed builds turn it off with the WHOS_HOT_ENABLED=false build arg.
  whosHotEnabled: true,
  // Feature toggle for the off-season data notice (the banner about stale team affiliations and
  // missing rookies). Off by default and independent of yahooSyncDisabled: a paused Yahoo sync is
  // not on its own a reason to tell every visitor it is the off-season. Deployed builds turn it on
  // with the OFFSEASON_ENABLED=true build arg.
  offseasonEnabled: false,
  // Feature toggle for the AI projection (the model-backed preset on the new-projection page and
  // the draft picker). On by default, like whosHotEnabled and for the same reason: the preset
  // already ships, so an unset flag has to mean "carry on offering it". Deployed builds turn it
  // off with the AI_PROJECTION_ENABLED=false build arg.
  aiProjectionEnabled: true,
};
