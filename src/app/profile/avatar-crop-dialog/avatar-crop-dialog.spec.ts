import { MockBuilder, MockRender } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarCropDialogComponent } from './avatar-crop-dialog';
import { AVATAR_SIDE, AvatarCrop, ImageSize, centredCrop } from '../../models/avatar-crop';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

/**
 * jsdom loads no images and lays nothing out, so the two things the dialog cannot get by itself
 * are given to it: the picture's size, which the browser would report on load, and the viewport's
 * size on screen, which is what turns a drag into a distance in the picture.
 */
describe('AvatarCropDialogComponent', () => {
  const PHOTO: ImageSize = { width: 800, height: 533 };
  const VIEWPORT_SIDE = 280;

  const file = new File([new Uint8Array([1, 2, 3])], 'me.jpg', { type: 'image/jpeg' });
  const createObjectURL = vi.fn(() => 'blob:picture');
  const revokeObjectURL = vi.fn();
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    return MockBuilder(AvatarCropDialogComponent)
      .mock(IconComponent)
      .keep(LoadingIndicatorComponent);
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  const render = async () => {
    const fixture = MockRender(AvatarCropDialogComponent, { file });
    await fixture.whenStable();
    fixture.detectChanges();
    const viewport = fixture.nativeElement.querySelector('.viewport') as HTMLElement;
    // A square of this side at the origin, which is all the drag conversion reads.
    viewport.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: VIEWPORT_SIDE, height: VIEWPORT_SIDE }) as DOMRect;
    return fixture;
  };

  type Fixture = Awaited<ReturnType<typeof render>>;

  const settle = async (fixture: Fixture) => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const picture = (fixture: Fixture) =>
    fixture.nativeElement.querySelector('.picture') as HTMLImageElement;

  /** What the browser reports once it has the file: the only way the dialog learns the size. */
  const load = async (fixture: Fixture, size: ImageSize) => {
    const image = picture(fixture);
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: size.width });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: size.height });
    image.dispatchEvent(new Event('load'));
    await settle(fixture);
  };

  const opened = async (size: ImageSize = PHOTO) => {
    const fixture = await render();
    await load(fixture, size);
    return fixture;
  };

  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    return event;
  };

  const drag = async (fixture: Fixture, dx: number, dy: number) => {
    const viewport = fixture.nativeElement.querySelector('.viewport') as HTMLElement;
    viewport.dispatchEvent(pointer('pointerdown', 100, 100));
    viewport.dispatchEvent(pointer('pointermove', 100 + dx, 100 + dy));
    viewport.dispatchEvent(pointer('pointerup', 100 + dx, 100 + dy));
    await settle(fixture);
  };

  const press = async (fixture: Fixture, key: string) => {
    const viewport = fixture.nativeElement.querySelector('.viewport') as HTMLElement;
    viewport.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await settle(fixture);
  };

  const zoomSlider = (fixture: Fixture) =>
    fixture.nativeElement.querySelector('#avatar-zoom') as HTMLInputElement | null;

  const button = (fixture: Fixture, label: string) =>
    Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim().startsWith(label));

  const crop = (fixture: Fixture): AvatarCrop | null =>
    (fixture.point.componentInstance as unknown as { crop: () => AvatarCrop | null }).crop();

  it('shows the picked file without uploading it', async () => {
    const fixture = await render();

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(picture(fixture).getAttribute('src')).toEqual('blob:picture');
  });

  it('opens on the middle of the picture, as the app cropped before there was a dialog', async () => {
    const fixture = await opened();

    expect(crop(fixture)).toEqual(centredCrop(PHOTO));
  });

  it('draws the picture behind the circle at the size the crop implies', async () => {
    const fixture = await opened();

    // The 533px square fills the viewport, so the 800px photo is 800/533 viewports wide and its
    // left edge sits 133.5/533 of a viewport outside it.
    expect(picture(fixture).style.width).toEqual(`${(800 / 533) * 100}%`);
    expect(picture(fixture).style.left).toEqual(`${(-133.5 / 533) * 100}%`);
    expect(picture(fixture).style.top).toEqual('0%');
  });

  it('moves the picture with the drag, so the square travels the other way', async () => {
    const fixture = await opened();

    await drag(fixture, -40, 0);

    // 40px of a 280px viewport is 40/280 of the 533px square.
    expect(crop(fixture)?.x).toBeCloseTo(133.5 + (40 / VIEWPORT_SIDE) * 533, 6);
  });

  it('stops the picture at its own edge instead of dragging past it', async () => {
    const fixture = await opened();

    await drag(fixture, -4000, 0);

    expect(crop(fixture)).toEqual({ x: 800 - 533, y: 0, side: 533 });
  });

  it('moves the picture with the arrow keys, the way dragging it does', async () => {
    const fixture = await opened();

    // Right drags the picture right by 4% of the viewport, so the square goes left by as much of
    // the photo: the same direction a drag of that distance would take it.
    await press(fixture, 'ArrowRight');

    expect(crop(fixture)?.x).toBeCloseTo(133.5 - 533 * 0.04, 6);

    await press(fixture, 'ArrowLeft');

    expect(crop(fixture)?.x).toBeCloseTo(133.5, 6);
  });

  it('leaves a key it has no use for alone', async () => {
    const fixture = await opened();

    await press(fixture, 'a');

    expect(crop(fixture)).toEqual(centredCrop(PHOTO));
  });

  it('zooms to the slider, keeping the middle of the square', async () => {
    const fixture = await opened();
    const slider = zoomSlider(fixture);

    slider!.value = '2';
    slider!.dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(crop(fixture)?.side).toBeCloseTo(533 / 2, 6);
    expect(crop(fixture)!.x + crop(fixture)!.side / 2).toBeCloseTo(400, 6);
  });

  it('offers zoom no further than the picture has pixels for', async () => {
    const fixture = await opened({ width: 1024, height: 1024 });

    expect(zoomSlider(fixture)?.getAttribute('max')).toEqual(String(1024 / AVATAR_SIDE));
  });

  it('offers no zoom at all on a picture smaller than the square it saves', async () => {
    const fixture = await opened({ width: 200, height: 150 });

    expect(zoomSlider(fixture)).toBeNull();
  });

  it('puts the square back in the middle when reset', async () => {
    const fixture = await opened();
    await drag(fixture, -60, 0);

    button(fixture, 'Reset')?.click();
    await settle(fixture);

    expect(crop(fixture)).toEqual(centredCrop(PHOTO));
  });

  it('hands the placed square to the page to save', async () => {
    const fixture = await opened();
    const saved: AvatarCrop[] = [];
    fixture.point.componentInstance.confirmed.subscribe((value: AvatarCrop) => saved.push(value));

    await drag(fixture, -40, 0);
    button(fixture, 'Save')?.click();
    await settle(fixture);

    expect(saved).toEqual([crop(fixture)]);
  });

  it('closes on Cancel and on Escape', async () => {
    const fixture = await opened();
    let closed = 0;
    fixture.point.componentInstance.closed.subscribe(() => closed++);

    button(fixture, 'Cancel')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(fixture);

    expect(closed).toEqual(2);
  });

  /** A file that claimed to be a JPEG and is not gets this far, and only the browser can tell. */
  it('reports a file the browser cannot draw', async () => {
    const fixture = await render();
    let unreadable = 0;
    fixture.point.componentInstance.unreadable.subscribe(() => unreadable++);

    picture(fixture).dispatchEvent(new Event('error'));
    await settle(fixture);

    expect(unreadable).toEqual(1);
  });

  it('reports a picture the browser read as no pixels at all', async () => {
    const fixture = await render();
    let unreadable = 0;
    fixture.point.componentInstance.unreadable.subscribe(() => unreadable++);

    await load(fixture, { width: 0, height: 0 });

    expect(unreadable).toEqual(1);
    expect(crop(fixture)).toBeNull();
  });

  it('says it is saving and takes no second press while the page uploads', async () => {
    const fixture = MockRender(AvatarCropDialogComponent, { file, saving: true });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(button(fixture, 'Cancel')?.disabled).toEqual(true);
    expect(fixture.nativeElement.textContent).toContain('Saving');
  });

  it('carries the reason the upload failed, so the placing is not lost with it', async () => {
    const fixture = MockRender(AvatarCropDialogComponent, {
      file,
      saveError: "Couldn't save your picture.",
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.field-error')?.textContent).toContain(
      "Couldn't save your picture.",
    );
  });

  it('lets go of the blob URL when it closes', async () => {
    const fixture = await opened();

    fixture.destroy();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:picture');
  });
});
