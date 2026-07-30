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
  // "Continue with Facebook" button. Set your dev app id (with localhost allowed) to test.
  facebookAppId: '',
  // Public PostHog project key (not a secret). Empty disables analytics entirely — see
  // AnalyticsService. Left empty in dev so local browsing never lands in the real stats.
  posthogKey: '',
  // Manual off-season switch. When true the Yahoo league-sync UI shows an off-season note
  // instead of its controls (see YahooLeagueSyncComponent). Off in local dev; the deployed
  // builds inject it via the YAHOO_SYNC_DISABLED build arg.
  yahooSyncDisabled: false,
};
