import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaddleConfigurationError } from './paddle';
import { PADDLE_INITIALIZER, PaddleService } from './paddle.service';

const initializePaddle = vi.fn();

describe('PaddleService', () => {
  let service: PaddleService;

  beforeEach(async () => {
    initializePaddle.mockReset();
    initializePaddle.mockResolvedValue({});
    await MockBuilder(PaddleService).provide({
      provide: PADDLE_INITIALIZER,
      useValue: initializePaddle,
    });
    service = TestBed.inject(PaddleService);
  });

  it('opens the sandbox for a test_ token', async () => {
    await service.initialize({ token: 'test_abc123' });

    expect(initializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test_abc123', environment: 'sandbox' }),
    );
  });

  it('opens live Paddle for a live_ token', async () => {
    await service.initialize({ token: 'live_abc123' });

    expect(initializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'live_abc123', environment: 'production' }),
    );
  });

  it("passes the page's event listener through to Paddle", async () => {
    const eventCallback = vi.fn();

    await service.initialize({ token: 'test_abc123', eventCallback });

    expect(initializePaddle).toHaveBeenCalledWith(expect.objectContaining({ eventCallback }));
  });

  // Rejecting rather than throwing is what lets both pages handle it in the catch they already have.
  it('rejects a token that names no environment, without asking Paddle anything', async () => {
    await expect(service.initialize({ token: 'pk_unknown' })).rejects.toBeInstanceOf(
      PaddleConfigurationError,
    );

    expect(initializePaddle).not.toHaveBeenCalled();
  });
});
