import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { INDEXABLE, initCrawlTags } from './crawl-tags';

@Component({ template: '' })
class BlankComponent {}

describe('initCrawlTags', () => {
  let router: Router;
  let meta: Meta;
  let document: Document;

  const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: BlankComponent, data: { [INDEXABLE]: true } },
          { path: 'privacy', component: BlankComponent, data: { [INDEXABLE]: true } },
          { path: 'forgot-password', component: BlankComponent },
          { path: 'pricing', redirectTo: 'privacy' },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    meta = TestBed.inject(Meta);
    document = TestBed.inject(DOCUMENT);
    canonical()?.remove();
    meta.removeTag('name="robots"');
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
});
