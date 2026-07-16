// Injected at build time (see Dockerfile). The public Google OAuth Client ID is not a
// secret; when the placeholder is left untouched (no var supplied) it resolves to empty,
// which hides the "Sign in with Google" button.
const googleClientIdFlag: string = '__GOOGLE_CLIENT_ID__';
const facebookAppIdFlag: string = '__FACEBOOK_APP_ID__';

// Public PostHog project key. Untouched, it resolves to empty, which disables analytics.
// Staging and production get different keys (separate PostHog projects) from Coolify.
const posthogKeyFlag: string = '__POSTHOG_KEY__';

// Also build-time injected: which deployed environment this bundle is, and its version.
// Untouched, they resolve to a plain production build with no version label.
const appEnvFlag: string = '__APP_ENV__';
const appVersionFlag: string = '__APP_VERSION__';

export const environment = {
  production: true,
  environmentName: appEnvFlag.startsWith('__APP_ENV') ? 'production' : appEnvFlag,
  version: appVersionFlag.startsWith('__APP_VERSION') ? '' : appVersionFlag,
  rootUrl: 'http://PLACEHOLDER_FOR_PROD_URL',
  apiUrl: 'http://PLACEHOLDER_FOR_PROD_URL/api/v1',
  googleClientId: googleClientIdFlag.startsWith('__GOOGLE') ? '' : googleClientIdFlag,
  facebookAppId: facebookAppIdFlag.startsWith('__FACEBOOK') ? '' : facebookAppIdFlag,
  posthogKey: posthogKeyFlag.startsWith('__POSTHOG') ? '' : posthogKeyFlag,
};
