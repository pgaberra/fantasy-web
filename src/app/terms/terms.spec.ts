import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { TermsComponent } from './terms';

function text(): string {
  // Whitespace collapsed, so a phrase checked here survives Prettier rewrapping the template.
  return ((ngMocks.find('.terms').nativeElement as HTMLElement).textContent ?? '').replace(
    /\s+/g,
    ' ',
  );
}

describe('TermsComponent', () => {
  beforeEach(() => MockBuilder(TermsComponent));

  it('renders the page', () => {
    MockRender(TermsComponent);

    expect(ngMocks.findAll('.terms__title').length).toEqual(1);
  });

  // Link, Stripe's service, is the merchant of record, so the contract of sale is with them and
  // LINK.COM is what shows on the customer's statement. Saying so is both a legal requirement and the
  // answer to the support mail that otherwise arrives asking who charged them.
  it.each(['Alexander Berglund', 'Stripe', 'LINK.COM', 'merchant of record'])(
    'names %s so the customer knows who they are dealing with',
    (phrase) => {
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // The subscription mechanics people actually get caught out by. If any of these change in
  // the code, this page has to change with them.
  it.each(['renews automatically', 'cancel at any time', "end of the period you've paid for"])(
    'states the subscription term %s',
    (phrase) => {
      MockRender(TermsComponent);

      expect(text()).toContain(phrase);
    },
  );

  // The refund policy is a section of these terms, reached as /terms#refunds from the footer and
  // from the old /refunds address. The id is what both land on.
  it('carries the refund policy under its own anchor', () => {
    MockRender(TermsComponent);

    expect(ngMocks.find('.terms #refunds').nativeElement.textContent).toContain(
      'Cancelling and refunds',
    );
  });

  // These are the commitments the policy makes. Each one is a promise to a paying customer, so a
  // change to any of them should be a deliberate edit that also changes this test.
  it.each([
    'within 14 days of your first payment',
    "Monthly renewals aren't refunded once the new period has started",
    'A payment taken after you cancelled.',
    'A second payment for the same period.',
    "A payment you didn't authorise.",
    'refund for any unused portion',
  ])('states the refund term: %s', (phrase) => {
    MockRender(TermsComponent);

    expect(text()).toContain(phrase);
  });

  it('tells the customer where to ask for a refund', () => {
    MockRender(TermsComponent);

    const hrefs = ngMocks
      .findAll('.terms a')
      .map((anchor) => (anchor.nativeElement as HTMLAnchorElement).getAttribute('href'));
    expect(hrefs).toContain('mailto:info@slapstat.com');
    expect(hrefs).toContain('https://support.link.com/topics/sold-through-link');
    expect(hrefs).toContain('https://link.com/terms');
  });

  it.each([
    // Cancelling and refunding are different things, and confusing them is what makes someone
    // cancel expecting money back.
    {
      promise: 'separates cancelling from refunding',
      phrase: "It doesn't refund a payment you've already made.",
    },
    // The terms cannot take away rights consumer law gives, and have to say so.
    {
      promise: 'keeps the consumer rights the law gives',
      phrase: 'consumer rights that cannot legally be excluded',
    },
    // The model is sold on its numbers, so the page has to be plain that they are estimates
    // before anyone pays for them, not after.
    { promise: 'says the projections are estimates', phrase: 'estimates' },
  ])('$promise', ({ phrase }) => {
    MockRender(TermsComponent);

    expect(text()).toContain(phrase);
  });
});
