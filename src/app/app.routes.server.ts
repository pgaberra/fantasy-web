import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * The public pages are prerendered at build time, so a client that reads HTML without running
 * JavaScript gets their content: a payment provider's automated domain review read slapstat.com
 * that way and found only the page title. Everything else renders in the browser, as the whole app used to.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'premium', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
