import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { retryInterceptor } from './interceptors/retry.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideApiConfiguration } from './api/api-configuration';
import { environment } from '../environments/environment';

const interceptors = environment.retryTransientErrors
  ? [retryInterceptor, authInterceptor]
  : [authInterceptor];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors(interceptors)),
    provideApiConfiguration(environment.rootUrl),
  ],
};
