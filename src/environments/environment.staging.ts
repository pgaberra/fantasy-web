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
};
