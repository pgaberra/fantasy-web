import type { initializePaddle, Paddle, PricePreviewResponse } from '@paddle/paddle-js';
import { environment } from '../../../environments/environment';

/**
 * Paddle.js for the prerender, where there is no browser to run it: a stand-in whose only method,
 * `PricePreview`, answers with Premium's base price from the build (`PREMIUM_BASE_PRICE_USD`).
 *
 * The Premium page used to prerender with no Paddle at all, so the HTML said only "Your exact price
 * is confirmed at checkout". A reader that runs no JavaScript saw a paid plan with no price, and
 * Paddle's domain review names missing public pricing as a reason to refuse a site. Asking Paddle
 * at build time does not work: its REST API answers the public client token with 403
 * `authentication_malformed`, and the key it does accept is a secret that a build arg would print
 * into the build log. So the figure comes from the build, and a browser still replaces it with the
 * visitor's own price from Paddle.js.
 *
 * Without the arg there is no stand-in, and the page renders its sentence; the Dockerfile refuses
 * that in a build that sells Premium.
 */
export function prerenderPaddleInitializer(
  basePriceUsd: string = environment.premiumBasePriceUsd,
): typeof initializePaddle {
  return () => {
    const amount = Number(basePriceUsd);
    if (!basePriceUsd || !Number.isFinite(amount)) {
      return Promise.resolve(undefined);
    }
    const paddle: Pick<Paddle, 'PricePreview'> = {
      PricePreview: () => Promise.resolve(basePricePreview(amount)),
    };
    return Promise.resolve(paddle as Paddle);
  };
}

/** Formatted the way Paddle formats a US quote, so the prerender and the browser read alike. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function basePricePreview(amount: number): PricePreviewResponse {
  const cents = String(Math.round(amount * 100));
  const lineItem = {
    totals: { subtotal: cents, discount: '0', tax: '0', total: cents },
    formattedTotals: {
      subtotal: usd.format(amount),
      discount: usd.format(0),
      tax: usd.format(0),
      total: usd.format(amount),
    },
  };
  // Only the fields the Premium page reads; the rest of Paddle.js's response type is never used.
  return {
    data: { currencyCode: 'USD', details: { lineItems: [lineItem] } },
  } as unknown as PricePreviewResponse;
}
