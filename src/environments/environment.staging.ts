export const environment = {
  production: false,
  environmentName: 'staging' as string,
  version: 'local' as string,
  rootUrl: 'https://api.staging.slapstat.com',
  apiUrl: 'https://api.staging.slapstat.com/api/v1',
  // Public Google OAuth Client ID (not a secret — shipped to the browser by design).
  googleClientId: '404846934195-2840u7mkdapmstllgsiaft2gdgjb2c0g.apps.googleusercontent.com',
  // Public Facebook App ID (not a secret). Empty until a staging Meta app exists.
  facebookAppId: '',
  // Off to mirror the deployed staging app, which keeps the "Continue with Facebook" button
  // hidden (FACEBOOK_LOGIN_ENABLED unset). Only backs `npm run start:staging`.
  facebookLoginEnabled: false,
  // Empty on purpose: this file only backs `npm run start:staging` (the app served locally
  // against the staging BFF), and a local run has no business in anyone's stats.
  //
  // Deployed staging has no POSTHOG_KEY either — it is set on the production app only, so
  // analytics is off on staging by configuration rather than by this file. Worth knowing before
  // reading anything into an empty staging funnel, and before assuming the consent banner has
  // been exercised anywhere but production.
  posthogKey: '',
  sentryDsn: '',
  // Off for local staging runs; the deployed builds set it via the YAHOO_SYNC_DISABLED build arg.
  yahooSyncDisabled: false,
  // Off for local staging runs; the deployed builds set it via the PAYMENTS_ENABLED build arg.
  paymentsEnabled: false,
  // Off for local staging runs; the deployed builds set it via the ESPN_LEAGUES_ENABLED build arg.
  espnLeaguesEnabled: false,
  // On for local staging runs; the deployed builds hide the page with WHOS_HOT_ENABLED=false.
  whosHotEnabled: true,
  // On for local staging runs; the deployed builds drop the preset with
  // AI_PROJECTION_ENABLED=false.
  aiProjectionEnabled: true,
  // Off for local staging runs, matching deployed staging, which sets OFFSEASON_ENABLED=false.
  offseasonEnabled: false,
};
