import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { RefundsComponent } from './refunds';

function text(): string {
  return (ngMocks.find('.refunds').nativeElement as HTMLElement).textContent ?? '';
}

describe('RefundsComponent', () => {
  beforeEach(() => MockBuilder(RefundsComponent));

  it('renders the page', () => {
    MockRender(RefundsComponent);

    expect(ngMocks.formatText(ngMocks.find('.refunds__title'))).toEqual('Refund policy');
  });

  // Link, Stripe's service, is the merchant of record, which is why the charge and the refund carry
  // a name the customer may not recognise.
  it.each(['Link, a Stripe service', 'merchant of record'])('names %s', (phrase) => {
    MockRender(RefundsComponent);

    expect(text()).toContain(phrase);
  });

  // These are the commitments the page makes. Each one is a promise to a paying customer, so a
  // change to any of them should be a deliberate edit that also changes this test.
  it.each([
    'within 14 days of your first payment',
    "Monthly renewals aren't refunded once the new period has started",
    'A payment taken after you cancelled.',
    'A second payment for the same period.',
    "A payment you didn't authorise.",
    'refund for any unused portion',
  ])('states the refund term: %s', (phrase) => {
    MockRender(RefundsComponent);

    expect(text()).toContain(phrase);
  });

  // Cancelling and refunding are different things, and confusing them is what makes someone
  // cancel expecting money back.
  it('separates cancelling from refunding', () => {
    MockRender(RefundsComponent);

    expect(text()).toContain("It doesn't refund a payment you've already made.");
  });

  // The page cannot take away rights consumer law gives, and has to say so.
  it.each(["Link's terms", 'statutory consumer rights'])('keeps the legal rights: %s', (phrase) => {
    MockRender(RefundsComponent);

    expect(text()).toContain(phrase);
  });

  it('tells the customer where to ask', () => {
    MockRender(RefundsComponent);

    const hrefs = ngMocks
      .findAll('.refunds a')
      .map((anchor) => (anchor.nativeElement as HTMLAnchorElement).getAttribute('href'));
    expect(hrefs).toContain('mailto:info@slapstat.com');
    expect(hrefs).toContain('https://support.link.com/topics/sold-through-link');
  });

  // The policy is part of the terms, and says so with a link a customer can follow.
  it('links back to the terms', () => {
    MockRender(RefundsComponent);

    const link = ngMocks
      .findAll('.refunds a')
      .find(
        (anchor) =>
          (anchor.nativeElement as HTMLElement).textContent?.trim() === 'Terms and Conditions',
      );
    if (!link) {
      throw new Error('The refund policy has no link to the terms');
    }
    expect(ngMocks.input(link, 'routerLink')).toEqual('/terms');
  });
});
