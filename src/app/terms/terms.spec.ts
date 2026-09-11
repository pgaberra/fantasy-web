import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { TermsComponent } from './terms';

function text(): string {
  return (ngMocks.find('.terms').nativeElement as HTMLElement).textContent ?? '';
}

describe('TermsComponent', () => {
  beforeEach(() => MockBuilder(TermsComponent));

  it('renders the page', () => {
    MockRender(TermsComponent);

    expect(ngMocks.findAll('.terms__title').length).toEqual(1);
  });

  // Paddle is the merchant of record, so the contract of sale is with them and their name is
  // what shows on the customer's statement. Saying so is both a legal requirement and the
  // answer to the support mail that otherwise arrives asking who charged them.
  it.each(['Alexander Berglund', 'Paddle', 'merchant of record'])(
    'names %s so the customer knows who they are dealing with',
    (phrase) => {
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // The subscription mechanics people actually get caught out by. If any of these change in
  // the code, this page has to change with them.
  it.each(['renews automatically', 'cancel at any time', 'end of the current billing period'])(
    'states the subscription term %s',
    (phrase) => {
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // Refunds have their own page, which Paddle's live checklist asks for. The terms point to it
  // rather than repeating it, so the refund wording cannot drift between two places.
  it('points to the refund policy for refunds', () => {
    MockRender(TermsComponent);

    const link = ngMocks
      .findAll('.terms a')
      .find(
        (anchor) => (anchor.nativeElement as HTMLElement).textContent?.trim() === 'Refund Policy',
      );
    if (!link) {
      throw new Error('The terms have no link to the refund policy');
    }
    expect(ngMocks.input(link, 'routerLink')).toEqual('/refunds');
    expect(text()).not.toContain('refund for any unused portion');
  });

  // The model is sold on its numbers, so the page has to be plain that they are estimates
  // before anyone pays for them, not after.
  it('says the projections are estimates', () => {
    MockRender(TermsComponent);

    expect(text()).toContain('estimates');
  });
});
