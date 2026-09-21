import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html' with { loader: 'text' };
import robots from '../../public/robots.txt' with { loader: 'text' };
import sitemap from '../../public/sitemap.xml' with { loader: 'text' };
import { RenderMode } from '@angular/ssr';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { DESCRIPTION, INDEXABLE } from './shared/crawl-tags';

/**
 * Which pages belong in search results is decided once, by `data: { [INDEXABLE]: true }` on the
 * route; shared/crawl-tags.ts marks every other page noindex. The files crawlers read without
 * running the app have to agree with that, and they drifted while they were lists of their own:
 * five pages added after robots.txt and sitemap.xml were written landed in neither, and
 * /forgot-password turned up in Google under the site's own title.
 */
const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)\s*$/gm)].map((match) => match[1]);
const listed = [...sitemap.matchAll(/<loc>https:\/\/slapstat\.com(\/[^<]*)<\/loc>/g)].map(
  (match) => match[1],
);

/** The URL a route answers on, cut at its first parameter: `projections/:id` → `/projections/`. */
const urlOf = (path: string): string => '/' + path.split(':')[0];
const isDisallowed = (url: string): boolean => disallowed.some((rule) => url.startsWith(rule));

const paths = routes.map((route) => route.path!);
const indexableRoutes = routes.filter((route) => route.data?.[INDEXABLE] === true);
const indexable = indexableRoutes.map((route) => urlOf(route.path!));

const homeTitle = /<title>([^<]*)<\/title>/.exec(indexHtml)![1];
const homeDescription = /<meta\s+name="description"\s+content="([^"]*)"/.exec(indexHtml)![1];

describe('crawl rules', () => {
  it('lists exactly the indexable pages in the sitemap', () => {
    const byUrl = (a: string, b: string) => a.localeCompare(b);

    expect([...listed].sort(byUrl)).toEqual([...indexable].sort(byUrl));
  });

  it('never keeps crawlers out of an indexable page', () => {
    expect(indexable.filter(isDisallowed)).toEqual([]);
  });

  it('lets crawlers reach share links and the password-reset request', () => {
    // X's link-preview bot obeys robots.txt, so a disallowed /s/ would stop a posted share link
    // from unfurling. /forgot-password is already in Google, and only a crawl that reads its
    // noindex takes it out again.
    expect(paths).toEqual(expect.arrayContaining(['s/:token', 'forgot-password']));
    expect(isDisallowed(urlOf('s/:token'))).toBe(false);
    expect(isDisallowed(urlOf('forgot-password'))).toBe(false);
  });

  it('has no Disallow rule left for a page the app no longer has', () => {
    const stale = disallowed.filter((rule) => !paths.some((path) => urlOf(path).startsWith(rule)));

    expect(stale).toEqual([]);
  });

  // Google folded /login into the home page while it was client-rendered: the HTML it fetched was
  // the bare shell, under the home page's title and description, and the canonical came later.
  it('prerenders every indexable page', () => {
    const prerendered = serverRoutes
      .filter((route) => route.renderMode === RenderMode.Prerender)
      .map((route) => route.path);

    expect(
      indexableRoutes.map((route) => route.path).filter((path) => !prerendered.includes(path!)),
    ).toEqual([]);
  });

  it('gives every indexable page but the home page a title and description of its own', () => {
    const notOwn = indexableRoutes
      .filter((route) => route.path !== '')
      .filter(
        (route) =>
          typeof route.title !== 'string' ||
          route.title === homeTitle ||
          typeof route.data?.[DESCRIPTION] !== 'string' ||
          route.data[DESCRIPTION] === homeDescription,
      )
      .map((route) => route.path);

    expect(homeTitle).toContain('SlapStat');
    expect(homeDescription).not.toEqual('');
    expect(notOwn).toEqual([]);
  });

  it('gives no two indexable pages the same title', () => {
    const titles = indexableRoutes.map((route) => route.title ?? homeTitle);

    expect(new Set(titles).size).toEqual(titles.length);
  });

  it('declares no canonical or og:url in index.html, which is served for every page', () => {
    expect(indexHtml).not.toMatch(/rel="canonical"|property="og:url"/);
  });
});
