import { ActivatedRoute } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TermsComponent } from './terms';

function text(): string {
  return (ngMocks.find('.terms').nativeElement as HTMLElement).textContent ?? '';
}

async function render(fragment: string | null = null) {
  await MockBuilder(TermsComponent).provide({
    provide: ActivatedRoute,
    useValue: { fragment: of(fragment) },
  });
  return MockRender(TermsComponent);
}

describe('TermsComponent', () => {
  const realScrollIntoView = Element.prototype.scrollIntoView;

  afterEach(() => {
    Element.prototype.scrollIntoView = realScrollIntoView;
  });

  it('renders the page', async () => {
    await render();

    expect(ngMocks.findAll('.terms__title').length).toEqual(1);
  });

  // Paddle is the merchant of record, so the contract of sale is with them and their name is
  // what shows on the customer's statement. Saying so is both a legal requirement and the
  // answer to the support mail that otherwise arrives asking who charged them.
  it.each(['Alexander Berglund', 'Paddle', 'merchant of record'])(
    'names %s so the customer knows who they are dealing with',
    async (phrase) => {
      await render();

      expect(text()).toContain(phrase);
    },
  );

  // The subscription mechanics people actually get caught out by. If any of these change in
  // the code, this page has to change with them.
  it.each(['renews automatically', 'cancel at any time', 'end of the current billing period'])(
    'states the subscription term %s',
    async (phrase) => {
      await render();

      expect(text()).toContain(phrase);
    },
  );

  // The refund policy was a page of its own until these terms absorbed it. Paddle's review
  // checks that it is reachable without an account, so the wording has to stay here.
  it.each(['buyer terms and refund policy', 'refund for any unused portion'])(
    'carries the refund policy: %s',
    async (phrase) => {
      await render();

      expect(text()).toContain(phrase);
    },
  );

  // Paddle's review also wants the refund policy reachable from the navigation, and the footer
  // links to this heading by its id. Renaming the id would break that link and nothing else.
  it('gives refunds a section of their own, with the id the footer links to', async () => {
    await render();

    const heading = ngMocks.find('h2#refunds').nativeElement as HTMLElement;
    expect(heading.textContent?.trim()).toEqual('Refunds');
  });

  it('scrolls to the refunds section when a link lands on it', async () => {
    const scrollIntoView = vi.fn();
    // jsdom lays nothing out, so it has no scrollIntoView of its own to call.
    Element.prototype.scrollIntoView = scrollIntoView;

    const fixture = await render('refunds');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toEqual(ngMocks.find('h2#refunds').nativeElement);
  });

  // The model is sold on its numbers, so the page has to be plain that they are estimates
  // before anyone pays for them, not after.
  it('says the projections are estimates', async () => {
    await render();

    expect(text()).toContain('estimates');
  });
});
