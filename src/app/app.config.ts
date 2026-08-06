import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { retryInterceptor } from './interceptors/retry.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideApiConfiguration } from './api/api-configuration';
import { environment } from '../environments/environment';
import { AnalyticsService } from './services/analytics.service';
import { AuthService } from './services/auth.service';
import { EntitlementService } from './services/entitlement.service';

// AuthService.storeTokens() only runs on an *active* sign-in, so a returning user whose token
// is already in localStorage would otherwise stay anonymous — identify them here too. The
// wiring lives in this initializer rather than inside AnalyticsService so that
// AuthService → AnalyticsService stays a one-way dependency (the reverse would be a cycle).
function initAnalytics() {
  const analytics = inject(AnalyticsService);

  // Safe before init(): the id is stashed and replayed once posthog has loaded.
  const userId = inject(AuthService).getUserId();
  if (userId) {
    analytics.identify(userId);
  }

  // Deliberately not returned: bootstrap must not wait on analytics. The empty catch is
  // intentional — a blocked or failed posthog fetch is not something to surface to a user,
  // and must not take the app down with it.
  void analytics.init().catch(() => undefined);
}

// retryInterceptor is outermost so it wraps authInterceptor (a retried request still
// gets a fresh Authorization header). It is a small always-on safety net for transient
// gateway/connection blips — see retry.interceptor.ts.
// Load the premium entitlement once at startup for a signed-in user (only when payments are on),
// so guards and the nav can read `premium` without each waiting on its own fetch. Failures fall
// back to non-premium inside EntitlementService, so bootstrap never blocks or breaks on this.
function initEntitlements() {
  if (environment.paymentsEnabled && inject(AuthService).isLoggedIn()) {
    inject(EntitlementService).refresh();
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([retryInterceptor, authInterceptor])),
    provideApiConfiguration(environment.rootUrl),
    provideAppInitializer(initAnalytics),
    provideAppInitializer(initEntitlements),
  ],
};
