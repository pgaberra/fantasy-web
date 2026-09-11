import { describe, expect, it } from 'vitest';
import { PaddleConfigurationError, paddleEnvironmentFor } from './paddle';

describe('paddleEnvironmentFor', () => {
  it('reads a test_ token as the sandbox', () => {
    expect(paddleEnvironmentFor('test_abc123')).toEqual('sandbox');
  });

  it('reads a live_ token as production', () => {
    expect(paddleEnvironmentFor('live_abc123')).toEqual('production');
  });

  // Nothing is guessed. An empty token, a mistyped one, or a server API key pasted into the client
  // token's slot must not quietly open either account.
  it.each(['', 'abc123', 'TEST_abc123', 'pdl_sdbx_apikey_abc123'])(
    'refuses a token that names no environment: %j',
    (clientToken) => {
      expect(() => paddleEnvironmentFor(clientToken)).toThrow(PaddleConfigurationError);
    },
  );
});
