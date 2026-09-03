import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarImageService, UnreadableImageError } from './avatar-image.service';

/**
 * jsdom has no image decoder and no canvas, so the happy path (decode, crop, re-encode) can only
 * run in a browser. What can be pinned down here is the contract around it: a file the browser
 * cannot decode surfaces as the one error the profile page knows how to word.
 */
describe('AvatarImageService', () => {
  let service: AvatarImageService;

  beforeEach(() => {
    service = TestBed.inject(AvatarImageService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a file the browser cannot decode as unreadable', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new DOMException('bad image', 'InvalidStateError')),
    );

    await expect(service.prepare(new File(['not an image'], 'me.txt'))).rejects.toBeInstanceOf(
      UnreadableImageError,
    );
  });

  it('asks the browser to honour the orientation stored in the photo', async () => {
    const createImageBitmap = vi
      .fn()
      .mockRejectedValue(new DOMException('bad image', 'InvalidStateError'));
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const file = new File(['x'], 'me.jpg');

    await service.prepare(file).catch(() => undefined);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });
});
