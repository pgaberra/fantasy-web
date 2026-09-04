import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AvatarImageService,
  UnreadableImageError,
  UnsupportedImageTypeError,
} from './avatar-image.service';

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

    await expect(
      service.prepare(new File(['not an image'], 'me.png', { type: 'image/png' })),
    ).rejects.toBeInstanceOf(UnreadableImageError);
  });

  it('turns away a format we do not take before trying to decode it', async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);

    await expect(
      service.prepare(new File(['GIF89a'], 'me.gif', { type: 'image/gif' })),
    ).rejects.toBeInstanceOf(UnsupportedImageTypeError);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  /** A file picked past the input's `accept` filter can reach here with no type at all. */
  it('turns away a file the browser gives no type for', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn());

    await expect(service.prepare(new File(['x'], 'me'))).rejects.toBeInstanceOf(
      UnsupportedImageTypeError,
    );
  });

  it('takes each of the formats it offers', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new DOMException('bad image', 'InvalidStateError')),
    );

    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      await expect(service.prepare(new File(['x'], 'me', { type }))).rejects.toBeInstanceOf(
        UnreadableImageError,
      );
    }
  });

  it('asks the browser to honour the orientation stored in the photo', async () => {
    const createImageBitmap = vi
      .fn()
      .mockRejectedValue(new DOMException('bad image', 'InvalidStateError'));
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });

    await service.prepare(file).catch(() => undefined);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });
});
