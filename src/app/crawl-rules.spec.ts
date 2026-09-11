import { describe, expect, it } from 'vitest';
import robots from '../../public/robots.txt' with { loader: 'text' };
import sitemap from '../../public/sitemap.xml' with { loader: 'text' };
import { routes } from './app.routes';

/**
 * robots.txt and sitemap.xml are hand-kept lists of the app's pages, and they drifted from the
 * router: /draft, /whos-hot, /profile, /pay and /terms were all added after both files were
 * written, and none of them landed in either, while /forgot-password was never kept out and
 * turned up in Google under the site's own title. These tests make every route take a side.
 */
const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)\s*$/gm)].map((match) => match[1]);
const listed = [...sitemap.matchAll(/<loc>https:\/\/slapstat\.com(\/[^<]*)<\/loc>/g)].map(
  (match) => match[1],
);

/** Routes that are deliberately in neither file, and why. */
const neither: Record<string, string> = {
  // Crawlable on purpose: X's link-preview bot obeys robots.txt, so disallowing /s/ would stop a
  // posted share link from unfurling. Not listed either, since each one is a single user's page.
  's/:token': 'share links',
  // Redirects home while the payments flag is off, so it is only worth listing once it is on.
  premium: 'behind the payments flag',
  pricing: 'redirects to /premium',
  account: 'redirects to /premium',
  '**': 'the not-found page',
};

/** The URL a route answers on, cut at its first parameter: `projections/:id` → `/projections/`. */
const urlOf = (path: string): string => '/' + path.split(':')[0];
const isDisallowed = (url: string): boolean => disallowed.some((rule) => url.startsWith(rule));

describe('crawl rules', () => {
  const paths = routes.map((route) => route.path!);

  it('places every route in the sitemap, behind a Disallow, or on the list of exceptions', () => {
    const unplaced = paths.filter(
      (path) => !(path in neither) && !listed.includes(urlOf(path)) && !isDisallowed(urlOf(path)),
    );

    expect(unplaced).toEqual([]);
  });

  it('never lists a page in the sitemap that robots.txt keeps crawlers out of', () => {
    expect(listed.filter(isDisallowed)).toEqual([]);
  });

  it('lists only pages the app has', () => {
    expect(listed.filter((url) => !paths.map(urlOf).includes(url))).toEqual([]);
  });

  it('keeps the exceptions crawlable and out of the sitemap, and drops ones for removed routes', () => {
    for (const path of Object.keys(neither)) {
      expect(paths).toContain(path);
      expect(isDisallowed(urlOf(path))).toBe(false);
      expect(listed).not.toContain(urlOf(path));
    }
  });
});
