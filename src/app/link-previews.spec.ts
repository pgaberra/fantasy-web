import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html' with { loader: 'text' };
import previews from '../link-previews.json';
import { RenderMode } from '@angular/ssr';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { INDEXABLE } from './shared/crawl-tags';

/**
 * The pages scripts/write-link-previews.mjs gives a link preview of their own. The script checks
 * the built shell and the image; this checks the list against the routes, which it cannot read.
 */
const homeTitle = /<meta\s+property="og:title"\s+content="([^"]*)"/.exec(indexHtml)![1];
const homeDescription = /<meta\s+property="og:description"\s+content="([^"]*)"/.exec(indexHtml)![1];

describe('link previews', () => {
  it('names only pages the app has', () => {
    const paths = routes.map((route) => route.path);

    expect(previews.map((preview) => preview.path).filter((path) => !paths.includes(path))).toEqual(
      [],
    );
  });

  it('leaves out prerendered and indexable pages, whose own HTML already carries their tags', () => {
    const prerendered = serverRoutes
      .filter((route) => route.renderMode === RenderMode.Prerender)
      .map((route) => route.path);
    const indexable = routes
      .filter((route) => route.data?.[INDEXABLE] === true)
      .map((route) => route.path);

    expect(
      previews
        .map((preview) => preview.path)
        .filter((path) => prerendered.includes(path) || indexable.includes(path)),
    ).toEqual([]);
  });

  it("describes each page in its own words, not the home page's", () => {
    for (const preview of previews) {
      expect(preview.title).toMatch(/ - SlapStat$/);
      expect(preview.title).not.toEqual(homeTitle);
      expect(preview.description).not.toEqual(homeDescription);
      expect(preview.description.length, preview.path).toBeLessThanOrEqual(200);
      expect(preview.image).toMatch(/^og\/[a-z0-9-]+\.png$/);
      expect(preview.imageAlt).not.toEqual('');
    }
  });
});
