import { HttpErrorResponse } from '@angular/common/http';

/**
 * What the BFF answers when a request needs a subscription this account does not have.
 *
 * <p>The pages hold these requests back on their own, so reaching one means the two disagreed:
 * a subscription that lapsed mid-session, an entitlement read that failed, or the moment
 * between a page rendering and the live read landing. Rare, but the message matters — "please
 * try again" over a refusal that will never change is the worst thing to say.
 */
export function isPremiumRefusal(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403;
}

export const PREMIUM_REFUSED_MESSAGE =
  'The AI projection is part of Premium. Open Premium from the account menu to subscribe.';
