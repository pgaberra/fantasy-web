import { describe, expect, it } from 'vitest';
import {
  AVATAR_SIDE,
  centredCrop,
  clampCrop,
  maxZoom,
  moveCrop,
  zoomCrop,
  zoomOf,
} from './avatar-crop';

/** The photo that started this: 800x533, with the face right of centre. */
const PHOTO = { width: 800, height: 533 };
const PORTRAIT = { width: 900, height: 1600 };

describe('the avatar crop', () => {
  describe('the square it opens on', () => {
    it('is the tallest square a wide photo holds, from the middle', () => {
      expect(centredCrop(PHOTO)).toEqual({ x: 133.5, y: 0, side: 533 });
    });

    it('is the widest square a tall photo holds, from the middle', () => {
      expect(centredCrop(PORTRAIT)).toEqual({ x: 0, y: 350, side: 900 });
    });

    it('is the whole of a square picture', () => {
      expect(centredCrop({ width: 400, height: 400 })).toEqual({ x: 0, y: 0, side: 400 });
    });
  });

  describe('how far it can be zoomed', () => {
    it('stops where one pixel of the crop is one pixel of the saved square', () => {
      expect(maxZoom({ width: 1024, height: 1024 })).toEqual(1024 / AVATAR_SIDE);
    });

    it('goes by the shorter side, which is what the square is cut from', () => {
      expect(maxZoom({ width: 4000, height: 512 })).toEqual(2);
    });

    it('will not zoom a picture smaller than the square we save', () => {
      expect(maxZoom({ width: 120, height: 90 })).toEqual(1);
    });

    it('reads 1 for the square the picture opens on, whatever its size', () => {
      expect(zoomOf(centredCrop(PHOTO), PHOTO)).toEqual(1);
      expect(zoomOf(centredCrop(PORTRAIT), PORTRAIT)).toEqual(1);
    });
  });

  describe('keeping the square inside the picture', () => {
    it('pulls a square that hangs off the right edge back in', () => {
      expect(clampCrop({ x: 700, y: 0, side: 533 }, PHOTO)).toEqual({ x: 267, y: 0, side: 533 });
    });

    it('pulls a square with a negative corner back in', () => {
      expect(clampCrop({ x: -40, y: -10, side: 300 }, PHOTO)).toEqual({ x: 0, y: 0, side: 300 });
    });

    /** Only the size is corrected: a square told to be too big stays where its corner was. */
    it('will not let a square grow past the shorter side', () => {
      expect(clampCrop({ x: 0, y: 0, side: 900 }, PHOTO)).toEqual({ x: 0, y: 0, side: 533 });
    });

    it('will not let a square shrink below the square we save', () => {
      expect(clampCrop({ x: 0, y: 0, side: 10 }, PHOTO).side).toEqual(AVATAR_SIDE);
    });

    /** A 120px picture can only ever be an upscale, so its own size is the floor. */
    it('takes the whole of a picture smaller than the square we save', () => {
      expect(clampCrop({ x: 0, y: 0, side: 10 }, { width: 120, height: 120 })).toEqual({
        x: 0,
        y: 0,
        side: 120,
      });
    });
  });

  describe('moving the square', () => {
    it('moves it by the distance asked for', () => {
      expect(moveCrop({ x: 133.5, y: 0, side: 400 }, PHOTO, 60, 20)).toEqual({
        x: 193.5,
        y: 20,
        side: 400,
      });
    });

    it('stops at the edge rather than following the drag off the picture', () => {
      expect(moveCrop({ x: 133.5, y: 0, side: 533 }, PHOTO, -5000, 0)).toEqual({
        x: 0,
        y: 0,
        side: 533,
      });
    });

    it('cannot move a square that already fills the picture', () => {
      const filled = centredCrop({ width: 500, height: 500 });

      expect(moveCrop(filled, { width: 500, height: 500 }, 100, 100)).toEqual(filled);
    });
  });

  describe('zooming', () => {
    it('keeps the middle of the square where it was', () => {
      const zoomed = zoomCrop({ x: 200, y: 100, side: 400 }, PHOTO, 533 / 300);

      expect(zoomed).toEqual({ x: 250, y: 150, side: 300 });
      expect(zoomOf(zoomed, PHOTO)).toBeCloseTo(533 / 300, 9);
    });

    it('zooms back out no further than the square the picture opened on', () => {
      expect(zoomCrop({ x: 300, y: 200, side: 200 }, PHOTO, 0.2)).toEqual(centredCrop(PHOTO));
    });

    it('refuses a zoom past what the picture has pixels for', () => {
      const size = { width: 1024, height: 1024 };

      expect(zoomCrop(centredCrop(size), size, 99).side).toEqual(AVATAR_SIDE);
    });

    /** Zooming in near an edge has to push the square back inside, not straddle the boundary. */
    it('keeps a square zoomed in at the corner inside the picture', () => {
      const corner = zoomCrop({ x: 0, y: 0, side: 533 }, PHOTO, 1);
      const zoomed = zoomCrop(corner, PHOTO, 2);

      expect(zoomed.x).toBeGreaterThanOrEqual(0);
      expect(zoomed.y).toBeGreaterThanOrEqual(0);
      expect(zoomed.x + zoomed.side).toBeLessThanOrEqual(PHOTO.width);
      expect(zoomed.y + zoomed.side).toBeLessThanOrEqual(PHOTO.height);
    });
  });
});
