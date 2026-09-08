import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { TermsComponent } from './terms';

function text(): string {
  return (ngMocks.find('.terms').nativeElement as HTMLElement).textContent ?? '';
}

describe('TermsComponent', () => {
  it('renders the page', async () => {
    await MockBuilder(TermsComponent);
    MockRender(TermsComponent);

    expect(ngMocks.findAll('.terms__title').length).toEqual(1);
  });

  // Paddle is the merchant of record, so the contract of sale is with them and their name is
  // what shows on the customer's statement. Saying so is both a legal requirement and the
  // answer to the support mail that otherwise arrives asking who charged them.
  it.each(['Alexander Berglund', 'Paddle', 'merchant of record'])(
    'names %s so the customer knows who they are dealing with',
    async (phrase) => {
      await MockBuilder(TermsComponent);
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // The subscription mechanics people actually get caught out by. If any of these change in
  // the code, this page has to change with them.
  it.each(['renews automatically', 'cancel at any time', 'end of the current billing period'])(
    'states the subscription term %s',
    async (phrase) => {
      await MockBuilder(TermsComponent);
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // The refund policy was a page of its own until these terms absorbed it. Paddle's review
  // checks that it is reachable without an account, so the wording has to stay here.
  it.each(['buyer terms and refund policy', 'refund for any unused portion'])(
    'carries the refund policy: %s',
    async (phrase) => {
      await MockBuilder(TermsComponent);
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // The model is sold on its numbers, so the page has to be plain that they are estimates
  // before anyone pays for them, not after.
  it('says the projections are estimates', async () => {
    await MockBuilder(TermsComponent);
    MockRender(TermsComponent);

    expect(text()).toContain('estimates');
  });
});
