import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import {
  FetchBackend,
  HttpBackend,
  HttpErrorResponse,
  HttpEvent,
  HttpRequest,
} from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { Observable, throwError } from 'rxjs';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { PADDLE_INITIALIZER } from './shared/paddle/paddle.service';

/**
 * The one request a prerendered page may make at build time: which features this environment
 * serves, so the Premium page lists the perks it will actually sell.
 */
const PRERENDER_ALLOWED_PATHS = ['/api/v1/features'];

/**
 * Prerendering runs at build time, where the API is somebody else's server and no visitor is
 * signed in. Anything but the feature flags is refused on the spot, so no page waits on the
 * network and nothing a visitor would see (players, a plan, an account) is baked into the HTML.
 * The pages render their signed-out, not-yet-loaded state, and the browser loads the rest.
 */
class PrerenderBackend implements HttpBackend {
  constructor(private readonly fetchBackend: FetchBackend) {}

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const path = new URL(request.urlWithParams, 'http://prerender.invalid').pathname;
    if (PRERENDER_ALLOWED_PATHS.includes(path)) {
      return this.fetchBackend.handle(request);
    }
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 400,
          statusText: 'Not requested while prerendering',
          url: request.url,
        }),
    );
  }
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Paddle.js is a browser script. At build time the Premium card renders without a quote, and
    // the browser asks Paddle for the visitor's own price when the page loads.
    { provide: PADDLE_INITIALIZER, useValue: () => Promise.resolve(undefined) },
    FetchBackend,
    { provide: HttpBackend, useClass: PrerenderBackend, deps: [FetchBackend] },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
