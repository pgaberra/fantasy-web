// Injected at build time (see Dockerfile). The public Google OAuth Client ID is not a
// secret; when the placeholder is left untouched (no var supplied) it resolves to empty,
// which hides the "Sign in with Google" button.
const googleClientIdFlag: string = '__GOOGLE_CLIENT_ID__';
const facebookAppIdFlag: string = '__FACEBOOK_APP_ID__';

// Feature toggle for the "Continue with Facebook" button. Only the literal "true" (via the
// FACEBOOK_LOGIN_ENABLED build arg) shows it; untouched or empty resolves to false, so the
// button stays hidden even when a FACEBOOK_APP_ID is present. Lets the Meta app stay wired up
// while Facebook login is held back (the Meta app is still in Development / not yet public).
const facebookLoginEnabledFlag: string = '__FACEBOOK_LOGIN_ENABLED__';

// Public PostHog project key. Untouched, it resolves to empty, which disables analytics.
// Staging and production get different keys (separate PostHog projects) from Coolify.
const posthogKeyFlag: string = '__POSTHOG_KEY__';

// Sentry DSN for browser error reporting. Not a secret — it ships to every visitor and only
// permits sending events. Untouched, it resolves to empty, which disables reporting.
const sentryDsnFlag: string = '__SENTRY_DSN__';

// Also build-time injected: which deployed environment this bundle is, and its version.
// Untouched, they resolve to a plain production build with no version label.
const appEnvFlag: string = '__APP_ENV__';
const appVersionFlag: string = '__APP_VERSION__';

// Manual off-season switch. Only the literal "true" (via the YAHOO_SYNC_DISABLED build arg)
// turns it on — the Yahoo league-sync UI then shows an off-season note instead of its
// controls. Untouched or empty resolves to false, so sync stays enabled by default.
const yahooSyncDisabledFlag: string = '__YAHOO_SYNC_DISABLED__';

// Subscription billing toggle. Only the literal "true" (via the PAYMENTS_ENABLED build arg)
// turns it on; untouched or empty resolves to false, keeping payments dark by default.
const paymentsEnabledFlag: string = '__PAYMENTS_ENABLED__';

// Premium shown but not yet sold. Only the literal "true" (via the PREMIUM_COMING_SOON build arg)
// disables Subscribe; untouched or empty resolves to false, so a build that sells
// Premium keeps selling it.
const premiumComingSoonFlag: string = '__PREMIUM_COMING_SOON__';

// ESPN league-sync toggle. Only the literal "true" (via the ESPN_LEAGUES_ENABLED build arg)
// turns it on; untouched or empty resolves to false, keeping the ESPN provider hidden by default.
const espnLeaguesEnabledFlag: string = '__ESPN_LEAGUES_ENABLED__';

// Who's hot toggle. The odd one out: the page already ships, so this reads the other way round —
// only the literal "false" (via the WHOS_HOT_ENABLED build arg) hides it, and untouched or empty
// leaves it visible. A deploy that forgets the arg keeps a live page rather than dropping it.
const whosHotEnabledFlag: string = '__WHOS_HOT_ENABLED__';

// Off-season notice toggle. Only the literal "true" (via the OFFSEASON_ENABLED build arg) shows
// the off-season data banner; untouched or empty resolves to false, so the banner stays hidden by
// default and has to be turned on deliberately each off-season.
const offseasonEnabledFlag: string = '__OFFSEASON_ENABLED__';

// Spreadsheet import toggle. Only the literal "true" (via the SPREADSHEET_IMPORT_ENABLED build arg)
// shows Import spreadsheet in the projection editor; untouched or empty resolves to false.
const spreadsheetImportEnabledFlag: string = '__SPREADSHEET_IMPORT_ENABLED__';

// Premium's price in US dollars, as a plain number ("4.99"), which /premium quotes both prerendered
// and in the browser. Must match the price the BFF's STRIPE_PRICE_ID charges.
const premiumBasePriceUsdFlag: string = '__PREMIUM_BASE_PRICE_USD__';

export const environment = {
  production: true,
  environmentName: appEnvFlag.startsWith('__APP_ENV') ? 'production' : appEnvFlag,
  version: appVersionFlag.startsWith('__APP_VERSION') ? '' : appVersionFlag,
  rootUrl: 'http://PLACEHOLDER_FOR_PROD_URL',
  apiUrl: 'http://PLACEHOLDER_FOR_PROD_URL/api/v1',
  googleClientId: googleClientIdFlag.startsWith('__GOOGLE') ? '' : googleClientIdFlag,
  facebookAppId: facebookAppIdFlag.startsWith('__FACEBOOK') ? '' : facebookAppIdFlag,
  facebookLoginEnabled: facebookLoginEnabledFlag === 'true',
  posthogKey: posthogKeyFlag.startsWith('__POSTHOG') ? '' : posthogKeyFlag,
  sentryDsn: sentryDsnFlag.startsWith('__SENTRY') ? '' : sentryDsnFlag,
  yahooSyncDisabled: yahooSyncDisabledFlag === 'true',
  paymentsEnabled: paymentsEnabledFlag === 'true',
  premiumComingSoon: premiumComingSoonFlag === 'true',
  espnLeaguesEnabled: espnLeaguesEnabledFlag === 'true',
  whosHotEnabled: whosHotEnabledFlag !== 'false',
  premiumBasePriceUsd: premiumBasePriceUsdFlag.startsWith('__PREMIUM_BASE_PRICE_USD')
    ? ''
    : premiumBasePriceUsdFlag,
  offseasonEnabled: offseasonEnabledFlag === 'true',
  spreadsheetImportEnabled: spreadsheetImportEnabledFlag === 'true',
};
