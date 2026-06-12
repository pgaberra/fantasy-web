// Injected at build time (see render.yaml). Defaults to off if the placeholder is
// left untouched, so retry-on-cold-start is only ever on where a deploy opts in
// (the Render free-tier staging service), never in a real production build.
const retryTransientErrorsFlag: string = '__RETRY_TRANSIENT_ERRORS__';

// Injected at build time (see render.yaml). The public Google OAuth Client ID is not a
// secret; when the placeholder is left untouched (no var supplied) it resolves to empty,
// which hides the "Sign in with Google" button.
const googleClientIdFlag: string = '__GOOGLE_CLIENT_ID__';

export const environment = {
  production: true,
  rootUrl: 'http://PLACEHOLDER_FOR_PROD_URL',
  apiUrl: 'http://PLACEHOLDER_FOR_PROD_URL/api/v1',
  retryTransientErrors: retryTransientErrorsFlag === 'true',
  googleClientId: googleClientIdFlag.startsWith('__GOOGLE') ? '' : googleClientIdFlag,
};
