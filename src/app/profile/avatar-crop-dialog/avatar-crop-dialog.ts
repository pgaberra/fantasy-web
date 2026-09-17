import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  AvatarCrop,
  ImageSize,
  centredCrop,
  maxZoom,
  moveCrop,
  zoomCrop,
  zoomOf,
} from '../../models/avatar-crop';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

/** How far an arrow key drags the picture, as a share of the viewport's side. */
const KEY_STEP = 0.04;

/** What a wheel notch is worth in zoom. A notch reports 100 or so, and 120 on Windows. */
const WHEEL_STEP = 400;

/**
 * Where the square that becomes the profile picture sits on the picked file: the picture behind a
 * circular hole, dragged into place and zoomed, with only what shows through it saved.
 *
 * It exists because the app used to take the middle of the picture and say nothing. The middle of
 * a photo is not where the subject of one is — a shot with room on either side put the face at
 * the edge of the circle, or half out of it — and since the upload is only ever this square, a
 * picture placed wrongly could not be nudged afterwards, only replaced with another that guessed
 * better.
 *
 * The state is the crop in the picture's own pixels (`models/avatar-crop`) rather than a transform
 * on screen, so what is dragged is the thing that gets saved, and one rule for what is in bounds
 * holds for a 40px thumbnail and a 6000px photo alike.
 */
@Component({
  selector: 'app-avatar-crop-dialog',
  imports: [IconComponent, LoadingIndicatorComponent],
  templateUrl: './avatar-crop-dialog.html',
  styleUrl: './avatar-crop-dialog.css',
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class AvatarCropDialogComponent implements OnInit, OnDestroy {
  /** The file the user picked. Shown from a blob URL; never uploaded as it is. */
  readonly file = input.required<File>();
  /** Set by the page while it uploads the crop, so the dialog can hold still and say so. */
  readonly saving = input(false);
  /** Why the page could not save it, shown beside the button that tried. */
  readonly saveError = input<string | null>(null);

  readonly closed = output<void>();
  /** The browser could not show the file, so the page words it and closes the dialog. */
  readonly unreadable = output<void>();
  readonly confirmed = output<AvatarCrop>();

  protected readonly source = signal<string | null>(null);
  protected readonly crop = signal<AvatarCrop | null>(null);
  private readonly size = signal<ImageSize | null>(null);

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');

  /** The pointer dragging the picture, of however many are on the screen. */
  private dragging: number | null = null;
  private lastPoint = { x: 0, y: 0 };

  protected readonly zoom = computed(() => {
    const crop = this.crop();
    const size = this.size();
    return crop && size ? zoomOf(crop, size) : 1;
  });

  protected readonly maxZoom = computed(() => {
    const size = this.size();
    return size ? maxZoom(size) : 1;
  });

  /** A picture no larger than the square we save has no room to be zoomed into. */
  protected readonly canZoom = computed(() => this.maxZoom() > 1);

  /**
   * Where the picture sits behind the hole, as a share of the viewport: the square fills the
   * viewport, so the whole picture is as many viewport-widths across as it is squares. Kept in per
   * cent so nothing has to be measured to draw it, at whatever size the viewport happens to be.
   */
  protected readonly pictureStyle = computed(() => {
    const crop = this.crop();
    const size = this.size();
    if (!crop || !size) {
      return null;
    }
    return {
      width: `${(size.width / crop.side) * 100}%`,
      height: `${(size.height / crop.side) * 100}%`,
      left: `${(-crop.x / crop.side) * 100}%`,
      top: `${(-crop.y / crop.side) * 100}%`,
    };
  });

  ngOnInit(): void {
    this.source.set(URL.createObjectURL(this.file()));
  }

  ngOnDestroy(): void {
    const source = this.source();
    if (source) {
      URL.revokeObjectURL(source);
    }
  }

  /**
   * The picture's size comes from the `<img>` showing it rather than from a second decode: both
   * the element and `createImageBitmap` report an EXIF-rotated photo at its rotated size, and the
   * save clamps the crop against its own decode regardless.
   */
  protected onLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    const size: ImageSize = { width: image.naturalWidth, height: image.naturalHeight };
    if (!size.width || !size.height) {
      this.unreadable.emit();
      return;
    }
    this.size.set(size);
    this.crop.set(centredCrop(size));
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.dragging !== null || event.button !== 0 || !this.crop()) {
      return;
    }
    this.dragging = event.pointerId;
    this.lastPoint = { x: event.clientX, y: event.clientY };
    // Capture keeps a drag alive past the edge of the viewport, which is where a drag that moves
    // the picture a long way ends up.
    this.viewport()?.nativeElement.setPointerCapture?.(event.pointerId);
    // The default is deliberately left alone: preventing it takes the press's focus with it, and
    // the arrow keys only reach the viewport once it has focus, so someone who drags first and
    // then reaches for the keys would find them dead. Nothing needs preventing — the picture is
    // `draggable="false"` and the viewport selects no text.
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragging !== event.pointerId) {
      return;
    }
    const dx = event.clientX - this.lastPoint.x;
    const dy = event.clientY - this.lastPoint.y;
    this.lastPoint = { x: event.clientX, y: event.clientY };
    this.movePicture(dx, dy);
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (this.dragging !== event.pointerId) {
      return;
    }
    this.dragging = null;
    this.viewport()?.nativeElement.releasePointerCapture?.(event.pointerId);
  }

  /**
   * The arrows move the picture, the way dragging it does: a press is a short drag, in the same
   * screen pixels, so both go through one conversion and both read the same way round.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.crop()) {
      return;
    }
    const step = (this.viewport()?.nativeElement.getBoundingClientRect().width ?? 0) * KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    this.movePicture(move[0], move[1]);
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.canZoom() || !this.crop()) {
      return;
    }
    event.preventDefault();
    this.setZoom(this.zoom() * Math.exp(-event.deltaY / WHEEL_STEP));
  }

  protected onZoomInput(event: Event): void {
    this.setZoom(Number((event.target as HTMLInputElement).value));
  }

  /** Back to the square the dialog opened on. */
  protected reset(): void {
    const size = this.size();
    if (size) {
      this.crop.set(centredCrop(size));
    }
  }

  protected confirm(): void {
    const crop = this.crop();
    if (crop && !this.saving()) {
      this.confirmed.emit(crop);
    }
  }

  /**
   * A distance dragged on screen, in the picture's own pixels: one viewport side is one square.
   * Measured rather than assumed, since the stylesheet sizes the viewport and a narrow phone
   * shrinks it.
   */
  private movePicture(dx: number, dy: number): void {
    const crop = this.crop();
    const size = this.size();
    const side = this.viewport()?.nativeElement.getBoundingClientRect().width ?? 0;
    if (!crop || !size || !side) {
      return;
    }
    // The picture follows the drag, so the square travels the other way.
    const perPixel = crop.side / side;
    this.crop.set(moveCrop(crop, size, -dx * perPixel, -dy * perPixel));
  }

  private setZoom(zoom: number): void {
    const crop = this.crop();
    const size = this.size();
    if (crop && size && Number.isFinite(zoom)) {
      this.crop.set(zoomCrop(crop, size, zoom));
    }
  }
}
