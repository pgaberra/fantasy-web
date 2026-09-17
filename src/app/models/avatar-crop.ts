/** The square the profile picture is saved as. Drawn at 32px in the header, so this is plenty. */
export const AVATAR_SIDE = 256;

/** The picture the crop is taken from, in its own pixels. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The square of a picture that becomes the profile picture, in the picture's own pixels — a
 * square because that is what the app draws, always inside the picture, and never so small that
 * the saved square would be an upscale of it.
 */
export interface AvatarCrop {
  /** The square's left edge. */
  readonly x: number;
  /** The square's top edge. */
  readonly y: number;
  readonly side: number;
}

/**
 * The square the picture opens on: the largest one, from the middle. This is the whole of what
 * the app used to do with a picked file, and it is a poor guess for a wide photo — the subject of
 * one is rarely dead centre — so it is a starting point now rather than the answer.
 */
export function centredCrop(size: ImageSize): AvatarCrop {
  const side = shortestSide(size);
  return { x: (size.width - side) / 2, y: (size.height - side) / 2, side };
}

/**
 * How far in a picture may be zoomed: until one pixel of the crop is one pixel of the saved
 * square. Further than that and the saved picture is an enlargement of a handful of pixels, which
 * looks like a mistake the user made rather than a limit they hit. A picture already smaller than
 * the square we save cannot be zoomed at all.
 */
export function maxZoom(size: ImageSize): number {
  return Math.max(1, shortestSide(size) / AVATAR_SIDE);
}

/** 1 while the crop is the largest square the picture allows, 2 at twice that magnification. */
export function zoomOf(crop: AvatarCrop, size: ImageSize): number {
  return crop.side > 0 ? shortestSide(size) / crop.side : 1;
}

/**
 * The nearest crop that is a square inside the picture, at a zoom the picture can carry. Every
 * change goes through here, and so does a crop that arrived from elsewhere: the dialog measures
 * the picture with an `<img>` and the saving measures it again with `createImageBitmap`, and a
 * crop clamped against the second cannot draw the grey outside the picture even if the two ever
 * disagreed about its size.
 */
export function clampCrop(crop: AvatarCrop, size: ImageSize): AvatarCrop {
  const largest = shortestSide(size);
  const side = clamp(crop.side, largest / maxZoom(size), largest);
  return {
    x: clamp(crop.x, 0, size.width - side),
    y: clamp(crop.y, 0, size.height - side),
    side,
  };
}

/** Moves the square by a distance in the picture's own pixels. */
export function moveCrop(crop: AvatarCrop, size: ImageSize, dx: number, dy: number): AvatarCrop {
  return clampCrop({ x: crop.x + dx, y: crop.y + dy, side: crop.side }, size);
}

/**
 * Sets the zoom, keeping the middle of the square where it was: zooming in on a face should keep
 * the face, not walk back towards the middle of the photo.
 */
export function zoomCrop(crop: AvatarCrop, size: ImageSize, zoom: number): AvatarCrop {
  const side = shortestSide(size) / clamp(zoom, 1, maxZoom(size));
  return clampCrop(
    {
      x: crop.x + crop.side / 2 - side / 2,
      y: crop.y + crop.side / 2 - side / 2,
      side,
    },
    size,
  );
}

function shortestSide(size: ImageSize): number {
  return Math.max(0, Math.min(size.width, size.height));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
