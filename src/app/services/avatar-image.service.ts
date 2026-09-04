import { Injectable } from '@angular/core';

/** The square the picture is scaled to. Drawn at 32px in the header, so this is plenty. */
export const AVATAR_SIDE = 256;
const JPEG_QUALITY = 0.85;

/**
 * What a picked file may be. The file picker asks for these through its `accept` attribute, but
 * that is only a filter — every platform lets the user choose "all files" past it — and the crop
 * below re-encodes whatever it can decode, so a GIF or a BMP would otherwise be accepted in
 * silence. Checking the type is what makes the answer the same either way.
 */
export const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** The `accept` attribute for a file input offering the above, so the two cannot drift apart. */
export const ACCEPTED_AVATAR_ACCEPT = ACCEPTED_AVATAR_TYPES.join(',');

/** The file the user picked is not one of the formats we take. */
export class UnsupportedImageTypeError extends Error {
  constructor() {
    super('The file is not a format we accept');
    this.name = 'UnsupportedImageTypeError';
  }
}

/** The file the user picked could not be decoded as an image. */
export class UnreadableImageError extends Error {
  constructor() {
    super('The file could not be read as an image');
    this.name = 'UnreadableImageError';
  }
}

/**
 * Turns whatever the user picked into the picture the server stores: a square crop from the
 * middle, scaled down and re-encoded as a JPEG. Done here rather than on the server because a
 * phone photo is several megabytes and the header draws it at 32px; scaling first turns the
 * upload into a few tens of kilobytes and takes the server out of the business of decoding
 * untrusted image files.
 */
@Injectable({ providedIn: 'root' })
export class AvatarImageService {
  async prepare(file: File): Promise<Blob> {
    if (!ACCEPTED_AVATAR_TYPES.some((accepted) => accepted === file.type)) {
      throw new UnsupportedImageTypeError();
    }
    const bitmap = await this.decode(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIDE;
      canvas.height = AVATAR_SIDE;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new UnreadableImageError();
      }
      // A JPEG has no transparency, so whatever the picture left uncovered would come out black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE);
      const side = Math.min(bitmap.width, bitmap.height);
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_SIDE,
        AVATAR_SIDE,
      );
      return await this.encode(canvas);
    } finally {
      bitmap.close();
    }
  }

  private async decode(file: File): Promise<ImageBitmap> {
    try {
      // Honouring the EXIF orientation is what keeps a phone photo the right way up.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new UnreadableImageError();
    }
  }

  private encode(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new UnreadableImageError())),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  }
}
