import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  NavigationEnd,
  provideRouter,
  Router,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { routes } from './app.routes';
import { retryInterceptor } from './interceptors/retry.interceptor';
import { timeoutInterceptor } from './interceptors/timeout.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideApiConfiguration } from './api/api-configuration';
import { environment } from '../environments/environment';
import { AnalyticsService } from './services/analytics.service';
import { AuthService } from './services/auth.service';
import { ErrorReportingService } from './services/error-reporting.service';
import { ReportingErrorHandler } from './services/reporting-error-handler';
import { clearStaleBuildReload, handleNavigationError } from './shared/navigation-error';
import { initCrawlTags } from './shared/crawl-tags';

// AuthService.storeTokens() only runs on an *active* sign-in, so a returning user whose token
// is already in localStorage would otherwise stay anonymous — identify them here too. The
// wiring lives in this initializer rather than inside AnalyticsService so that
// AuthService → AnalyticsService stays a one-way dependency (the reverse would be a cycle).
function initAnalytics() {
  // A page prerendered at build time has no visitor to count.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return;
  }
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

// Mirrors initAnalytics: the same one-way dependency (AuthService -> reporting, never back),
// and the same refusal to let bootstrap wait on it. A user id makes an error answerable
// ("whose session was this?") without carrying their email, which sits in the same token.
function initErrorReporting() {
  // Nor, at build time, anyone to report an error for.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return;
  }
  const reporting = inject(ErrorReportingService);

  const userId = inject(AuthService).getUserId();
  if (userId) {
    reporting.identify(userId);
  }

  void reporting.init().catch(() => undefined);
}

// A navigation that completes means the tab is running against a build that still exists, so
// the one-shot reload guard is spent and a later deploy may use it again.
function initNavigationRecovery() {
  // The reload guard lives in the tab's sessionStorage, which a build-time render does not have.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return;
  }
  const router = inject(Router);
  router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
    if (event instanceof NavigationEnd) {
      clearStaleBuildReload();
    }
  });
}

// retryInterceptor is outermost so it wraps authInterceptor (a retried request still
// gets a fresh Authorization header). It is a small always-on safety net for transient
// gateway/connection blips — see retry.interceptor.ts. timeoutInterceptor sits inside it, so
// each attempt gets its own bound and a timeout is not retried.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    provideRouter(
      routes,
      withNavigationErrorHandler(handleNavigationError),
      // So the footer's Refunds link lands on that section of the terms.
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withInterceptors([retryInterceptor, timeoutInterceptor, authInterceptor])),
    provideApiConfiguration(environment.rootUrl),
    provideAppInitializer(initNavigationRecovery),
    provideAppInitializer(initCrawlTags),
    provideAppInitializer(initErrorReporting),
    provideAppInitializer(initAnalytics),
  ],
};
