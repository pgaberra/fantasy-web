import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { DESCRIPTION, INDEXABLE, initCrawlTags } from './crawl-tags';

@Component({ template: '' })
class BlankComponent {}

describe('initCrawlTags', () => {
  let router: Router;
  let meta: Meta;
  let title: Title;
  let document: Document;

  const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: BlankComponent, data: { [INDEXABLE]: true } },
          {
            path: 'privacy',
            component: BlankComponent,
            title: 'Privacy policy - SlapStat',
            data: { [INDEXABLE]: true, [DESCRIPTION]: 'What we collect.' },
          },
          { path: 'forgot-password', component: BlankComponent },
          { path: 'pricing', redirectTo: 'privacy' },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    meta = TestBed.inject(Meta);
    title = TestBed.inject(Title);
    document = TestBed.inject(DOCUMENT);
    canonical()?.remove();
    meta.removeTag('name="robots"');
    // What index.html declares, which a page without its own falls back to.
    title.setTitle('SlapStat - Home');
    meta.updateTag({ name: 'description', content: 'The home page.' });
    TestBed.runInInjectionContext(initCrawlTags);
  });

  it('points an indexable page at its own address on the live site, without the query', async () => {
    await router.navigateByUrl('/privacy?checkout=success#top');

    expect(canonical()?.href).toEqual('https://slapstat.com/privacy');
    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('points the home page at the site root', async () => {
    await router.navigateByUrl('/');

    expect(canonical()?.href).toEqual('https://slapstat.com/');
  });

  it('marks every other page noindex and takes the canonical away', async () => {
    await router.navigateByUrl('/privacy');
    await router.navigateByUrl('/forgot-password');

    expect(meta.getTag('name="robots"')?.content).toEqual('noindex');
    expect(canonical()).toBeNull();
  });

  it('lifts the noindex again on the way back to an indexable page', async () => {
    await router.navigateByUrl('/forgot-password');
    await router.navigateByUrl('/');

    expect(meta.getTag('name="robots"')).toBeNull();
    expect(canonical()?.href).toEqual('https://slapstat.com/');
  });

  it('credits a redirect to the page it lands on', async () => {
    await router.navigateByUrl('/pricing');

    expect(canonical()?.href).toEqual('https://slapstat.com/privacy');
  });

  it('gives a page its own title and description, for search results and link previews', async () => {
    await router.navigateByUrl('/privacy');

    expect(title.getTitle()).toEqual('Privacy policy - SlapStat');
    expect(meta.getTag('property="og:title"')?.content).toEqual('Privacy policy - SlapStat');
    expect(meta.getTag('name="twitter:title"')?.content).toEqual('Privacy policy - SlapStat');
    expect(meta.getTag('name="description"')?.content).toEqual('What we collect.');
    expect(meta.getTag('property="og:description"')?.content).toEqual('What we collect.');
    expect(meta.getTag('name="twitter:description"')?.content).toEqual('What we collect.');
  });

  it("puts index.html's title and description back on a page without its own", async () => {
    await router.navigateByUrl('/privacy');
    await router.navigateByUrl('/forgot-password');

    expect(title.getTitle()).toEqual('SlapStat - Home');
    expect(meta.getTag('property="og:title"')?.content).toEqual('SlapStat - Home');
    expect(meta.getTag('name="description"')?.content).toEqual('The home page.');
    expect(meta.getTag('property="og:description"')?.content).toEqual('The home page.');
  });
});
