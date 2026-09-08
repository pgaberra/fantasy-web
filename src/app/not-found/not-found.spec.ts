import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { NotFoundComponent } from './not-found';

describe('NotFoundComponent', () => {
  it('says the page is not found and offers the way back', async () => {
    await MockBuilder(NotFoundComponent);
    MockRender(NotFoundComponent);

    expect(ngMocks.find('.not-found__title').nativeElement.textContent).toContain('Page not found');
    expect(ngMocks.find('.not-found__home').attributes['routerLink']).toEqual('/');
  });
});
