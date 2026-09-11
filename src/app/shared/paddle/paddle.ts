import type { Environments, PaddleEventData } from '@paddle/paddle-js';

/**
 * Thrown when the build's Paddle client token cannot be matched to a Paddle environment.
 *
 * A fault in how the app was built rather than in anything the visitor did, so callers report it
 * instead of quietly showing a page without Paddle.
 */
export class PaddleConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaddleConfigurationError';
  }
}

/** What the app passes to Paddle.js: a client token, and a listener where a page needs one. */
export interface PaddleTokenOptions {
  token: string;
  eventCallback?: (event: PaddleEventData) => void;
}

/**
 * The Paddle environment a client-side token belongs to, read off the token itself.
 *
 * Paddle prefixes sandbox tokens `test_` and live ones `live_`, so the token already says which
 * account it opens. A separate environment setting could only agree with it or contradict it, and
 * the build arg we had fell back to production when it was left unset, pairing a sandbox token
 * with live Paddle. Nothing is defaulted here: a token of any other shape is a build fault.
 */
export function paddleEnvironmentFor(clientToken: string): Environments {
  if (clientToken.startsWith('test_')) {
    return 'sandbox';
  }
  if (clientToken.startsWith('live_')) {
    return 'production';
  }
  throw new PaddleConfigurationError(
    'The Paddle client token starts with neither test_ nor live_, so its environment is unknown',
  );
}
