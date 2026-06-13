import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { retryInterceptor } from './interceptors/retry.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideApiConfiguration } from './api/api-configuration';
import { environment } from '../environments/environment';

// retryInterceptor is outermost so it wraps authInterceptor (a retried request still
// gets a fresh Authorization header). It is a small always-on safety net for transient
// gateway/connection blips — see retry.interceptor.ts.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([retryInterceptor, authInterceptor])),
    provideApiConfiguration(environment.rootUrl),
  ],
};
