export const environment = {
  production: false,
  environmentName: 'development' as string,
  version: 'local' as string,
  rootUrl: 'http://localhost:8080',
  apiUrl: 'http://localhost:8080/api/v1',
  // Public Google OAuth Client ID (not a secret — shipped to the browser by design).
  // The same client allows the http://localhost:4200 JS origin, so local dev works.
  googleClientId: '404846934195-2840u7mkdapmstllgsiaft2gdgjb2c0g.apps.googleusercontent.com',
};
