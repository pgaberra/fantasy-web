import { Injector, PendingTasks, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prerenderPaddleInitializer } from './paddle-prerender';

const fetchFn = vi.fn();

function restPreview(total: string, discount: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        data: {
          currency_code: 'USD',
          details: {
            line_items: [
              {
                totals: { subtotal: '499', discount: '0', tax: '0', total: '499' },
                formatted_totals: { subtotal: total, discount, tax: '$0.00', total },
              },
            ],
          },
        },
      }),
  };
}

describe('prerenderPaddleInitializer', () => {
  let injector: Injector;

  beforeEach(() => {
    fetchFn.mockReset();
    TestBed.resetTestingModule();
    injector = TestBed.inject(Injector);
  });

  function initializer() {
    return runInInjectionContext(injector, () =>
      prerenderPaddleInitializer(fetchFn as unknown as typeof fetch),
    );
  }

  it("quotes the US base price from live Paddle's REST API with the client token", async () => {
    fetchFn.mockResolvedValue(restPreview('$4.99', '$0.00'));
    const paddle = await initializer()({ token: 'live_abc', environment: 'production' });

    const preview = await paddle!.PricePreview({ items: [{ priceId: 'pri_1', quantity: 1 }] });

    expect(fetchFn).toHaveBeenCalledWith('https://api.paddle.com/pricing-preview', {
      method: 'POST',
      headers: { Authorization: 'Bearer live_abc', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ price_id: 'pri_1', quantity: 1 }],
        address: { country_code: 'US' },
      }),
    });
    const lineItem = preview.data.details.lineItems[0];
    expect(lineItem.formattedTotals.total).toBe('$4.99');
    expect(lineItem.formattedTotals.discount).toBe('$0.00');
    expect(lineItem.totals.discount).toBe('0');
  });

  it('asks the sandbox API for a sandbox token', async () => {
    fetchFn.mockResolvedValue(restPreview('$4.99', '$0.00'));
    const paddle = await initializer()({ token: 'test_abc', environment: 'sandbox' });

    await paddle!.PricePreview({ items: [{ priceId: 'pri_1', quantity: 1 }] });

    expect(fetchFn.mock.calls[0][0]).toBe('https://sandbox-api.paddle.com/pricing-preview');
  });

  it('rejects when Paddle refuses, so the page falls back and the image build catches it', async () => {
    fetchFn.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('{"error":{"code":"forbidden"}}'),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const paddle = await initializer()({ token: 'live_abc', environment: 'production' });

    await expect(
      paddle!.PricePreview({ items: [{ priceId: 'pri_1', quantity: 1 }] }),
    ).rejects.toThrow('403: {"error":{"code":"forbidden"}}');
    expect(logged).toHaveBeenCalledWith(
      'Prerender: no Premium price from Paddle.',
      expect.any(Error),
    );
    logged.mockRestore();
  });

  it('holds the prerender open until Paddle has answered', async () => {
    let answer: (value: unknown) => void = vi.fn();
    fetchFn.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const done = vi.fn();
    vi.spyOn(TestBed.inject(PendingTasks), 'add').mockReturnValue(done);
    const paddle = await initializer()({ token: 'live_abc', environment: 'production' });

    const preview = paddle!.PricePreview({ items: [{ priceId: 'pri_1', quantity: 1 }] });
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    answer(restPreview('$4.99', '$0.00'));
    await preview;
    expect(done).toHaveBeenCalledOnce();
  });
});
