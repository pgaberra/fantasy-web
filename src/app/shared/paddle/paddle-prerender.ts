import { inject, PendingTasks } from '@angular/core';
import type {
  Environments,
  initializePaddle,
  Paddle,
  PricePreviewParams,
  PricePreviewResponse,
} from '@paddle/paddle-js';

/** The country the prerendered price is quoted for, which is the catalog's base currency, USD. */
export const PRERENDER_PRICE_COUNTRY = 'US';

interface RestTotals {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

/** The parts of Paddle's REST pricing preview the Premium page reads, as the API returns them. */
interface RestPricePreview {
  data: {
    currency_code: string;
    details: { line_items: { totals: RestTotals; formatted_totals: RestTotals }[] };
  };
}

/**
 * Paddle.js for the prerender, where there is no browser to run it: a stand-in whose only method
 * is `PricePreview`, answered by Paddle's REST API with the same client token.
 *
 * The Premium page used to prerender with no Paddle at all, so the HTML said only "Your exact price
 * is confirmed at checkout". A reader that runs no JavaScript saw a paid plan with no price, and
 * Paddle's domain review names missing public pricing as a reason to refuse a site. The pricing
 * preview needs no secret, only the public token the bundle already ships.
 *
 * The quote is for the US, the catalog's base price, because the build has no visitor to localize
 * for. A browser replaces it with the visitor's own price as soon as the page loads.
 *
 * The request is held as a pending task, or the prerender would snapshot the page before Paddle
 * answered. A failure rejects, the page falls back to its sentence, and the Docker build refuses
 * the result (see Dockerfile), since a quietly unpriced page is the fault this exists to prevent.
 */
export function prerenderPaddleInitializer(fetchFn: typeof fetch = fetch): typeof initializePaddle {
  const pendingTasks = inject(PendingTasks);
  return (options) => {
    const token = options?.token;
    if (!token) {
      return Promise.resolve(undefined);
    }
    const paddle: Pick<Paddle, 'PricePreview'> = {
      PricePreview: async (request) => {
        const done = pendingTasks.add();
        try {
          return await previewOverRest(fetchFn, token, options.environment, request);
        } finally {
          done();
        }
      },
    };
    return Promise.resolve(paddle as Paddle);
  };
}

async function previewOverRest(
  fetchFn: typeof fetch,
  token: string,
  environment: Environments | undefined,
  request: PricePreviewParams,
): Promise<PricePreviewResponse> {
  const apiBase =
    environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  const response = await fetchFn(`${apiBase}/pricing-preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: request.items.map((item) => ({ price_id: item.priceId, quantity: item.quantity })),
      address: { country_code: PRERENDER_PRICE_COUNTRY },
    }),
  });
  if (!response.ok) {
    throw new Error(`Paddle's pricing preview answered ${response.status}`);
  }
  const body = (await response.json()) as RestPricePreview;
  const lineItems = body.data.details.line_items.map((lineItem) => ({
    totals: lineItem.totals,
    formattedTotals: lineItem.formatted_totals,
  }));
  // Only the fields the Premium page reads; the rest of Paddle.js's response type is never used.
  return {
    data: { currencyCode: body.data.currency_code, details: { lineItems } },
  } as unknown as PricePreviewResponse;
}
