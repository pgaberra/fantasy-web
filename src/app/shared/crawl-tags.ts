import { DOCUMENT, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';

/** The address search engines should credit a page to, whichever deployment served it. */
export const SITE_ORIGIN = 'https://slapstat.com';

/**
 * The route data key that lets search engines index a page: `data: { [INDEXABLE]: true }`. Every
 * route without it is marked noindex, so a new page stays out of search results until someone
 * decides it belongs there, and public/sitemap.xml has to agree (crawl-rules.spec.ts checks).
 */
export const INDEXABLE = 'indexable';

/**
 * Keeps the page's crawl tags in step with the route. index.html is served for every address, so
 * whatever it declared about "this page" it declared about all of them: its one canonical link
 * made /privacy, /terms and /login copies of the home page. Google renders the app before it
 * indexes, so the tags set here are the ones it reads.
 */
export function initCrawlTags(): void {
  const router = inject(Router);
  const meta = inject(Meta);
  const document = inject(DOCUMENT);

  router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
    if (!(event instanceof NavigationEnd)) {
      return;
    }
    let route = router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (route.data[INDEXABLE] === true) {
      meta.removeTag('name="robots"');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      // Without the query string: ?checkout=success or a campaign tag is still the same page.
      canonical.href = SITE_ORIGIN + event.urlAfterRedirects.split(/[?#]/)[0];
    } else {
      // A canonical on a noindex page gives Google two opposite signals, so it goes.
      meta.updateTag({ name: 'robots', content: 'noindex' });
      canonical?.remove();
    }
  });
}
