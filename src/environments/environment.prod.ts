// Injected at build time (see Dockerfile). The public Google OAuth Client ID is not a
// secret; when the placeholder is left untouched (no var supplied) it resolves to empty,
// which hides the "Sign in with Google" button.
const googleClientIdFlag: string = '__GOOGLE_CLIENT_ID__';

export const environment = {
  production: true,
  rootUrl: 'http://PLACEHOLDER_FOR_PROD_URL',
  apiUrl: 'http://PLACEHOLDER_FOR_PROD_URL/api/v1',
  googleClientId: googleClientIdFlag.startsWith('__GOOGLE') ? '' : googleClientIdFlag,
};
