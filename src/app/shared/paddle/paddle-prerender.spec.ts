import { describe, expect, it } from 'vitest';
import { prerenderPaddleInitializer } from './paddle-prerender';

describe('prerenderPaddleInitializer', () => {
  it("quotes the build's base price the way Paddle formats a US price", async () => {
    const paddle = await prerenderPaddleInitializer('4.99')({ token: 'live_abc' });

    const preview = await paddle!.PricePreview({ items: [{ priceId: 'pri_1', quantity: 1 }] });

    const lineItem = preview.data.details.lineItems[0];
    expect(lineItem.formattedTotals.total).toBe('$4.99');
    expect(lineItem.totals.total).toBe('499');
    // The free column borrows its zero from the discount of an undiscounted price.
    expect(lineItem.totals.discount).toBe('0');
    expect(lineItem.formattedTotals.discount).toBe('$0.00');
  });

  it('opens no Paddle without a base price, so the page falls back to its sentence', async () => {
    expect(await prerenderPaddleInitializer('')({ token: 'live_abc' })).toBeUndefined();
  });

  it('opens no Paddle for a base price that is not a number', async () => {
    expect(await prerenderPaddleInitializer('4,99')({ token: 'live_abc' })).toBeUndefined();
  });
});
