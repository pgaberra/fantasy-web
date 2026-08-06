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
  // Manual off-season switch. When true the Yahoo league-sync UI shows an off-season note
  // instead of its controls (see YahooLeagueSyncComponent). Off in local dev; the deployed
  // builds inject it via the YAHOO_SYNC_DISABLED build arg.
  yahooSyncDisabled: false,
  // Subscription billing. Off by default; deployed builds drive it via the PAYMENTS_ENABLED
  // build arg. When false the pricing/account routes redirect away and no entitlement is fetched.
  paymentsEnabled: false,
};
