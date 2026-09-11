import { inject, Injectable, InjectionToken } from '@angular/core';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { paddleEnvironmentFor, type PaddleTokenOptions } from './paddle';

/**
 * Paddle.js's own initializer, behind a token so that specs hand in a fake through DI.
 *
 * Mocking `@paddle/paddle-js` as a module did not hold once the import moved into this shared
 * code: the /pay spec passed on its own and failed inside the full suite. DI gives each spec its
 * own fake regardless of how the runner shares modules between spec files.
 */
export const PADDLE_INITIALIZER = new InjectionToken<typeof initializePaddle>(
  'PADDLE_INITIALIZER',
  { providedIn: 'root', factory: () => initializePaddle },
);

/** Opens Paddle.js in the environment the build's client token belongs to. */
@Injectable({
  providedIn: 'root',
})
export class PaddleService {
  private readonly initializePaddle = inject(PADDLE_INITIALIZER);

  /**
   * Initializes Paddle.js for this token. Async so that a token of unknown shape rejects with a
   * `PaddleConfigurationError`, and reaches the caller's catch like any other failure to
   * initialize, without Paddle having been asked anything.
   */
  async initialize(options: PaddleTokenOptions): Promise<Paddle | undefined> {
    return this.initializePaddle({
      token: options.token,
      eventCallback: options.eventCallback,
      environment: paddleEnvironmentFor(options.token),
    });
  }
}
