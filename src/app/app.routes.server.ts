import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * The public pages are prerendered at build time, so a client that reads HTML without running
 * JavaScript gets their content: a payment provider's automated domain review read slapstat.com
 * that way and found only the page title. Everything else renders in the browser, as the whole app used to.
 *
 * Every indexable page is here too (crawl-rules.spec.ts checks): a client-rendered page is served
 * as the bare shell, whose title and description are the home page's, and Google folded /login
 * into the home page on exactly that.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'premium', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'register', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
