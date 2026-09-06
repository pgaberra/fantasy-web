import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { RefundsComponent } from './refunds';

function text(): string {
  return (ngMocks.find('.refunds').nativeElement as HTMLElement).textContent ?? '';
}

describe('RefundsComponent', () => {
  it('renders the page', async () => {
    await MockBuilder(RefundsComponent);
    MockRender(RefundsComponent);

    expect(ngMocks.findAll('.refunds__title').length).toEqual(1);
  });

  // The statutory withdrawal right for EU and UK consumers. It is the one thing on this page
  // that is not ours to decide, so it is pinned.
  it('states the 14 day right to withdraw', async () => {
    await MockBuilder(RefundsComponent);
    MockRender(RefundsComponent);

    expect(text()).toContain('14 days');
  });

  // Refunds are issued by Paddle, not by us, which is why the money comes back from a name the
  // customer may not recognise. And there has to be an address to write to.
  it.each(['Paddle', 'info@slapstat.com'])('tells the customer where to go: %s', async (phrase) => {
    await MockBuilder(RefundsComponent);
    MockRender(RefundsComponent);

    expect(text()).toContain(phrase);
  });

  // Cancelling and refunding are different things, and confusing them is what makes someone
  // cancel early expecting money back.
  it('separates cancelling from refunding', async () => {
    await MockBuilder(RefundsComponent);
    MockRender(RefundsComponent);

    expect(text()).toContain('Cancelling is not the same as a refund');
  });
});
