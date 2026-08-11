import {
  DestroyRef,
  Directive,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ConnectedPosition,
  Overlay,
  OverlayPositionBuilder,
  OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

/**
 * Opens a template as a popover anchored to the host element.
 *
 * The table's settings all hang off small triggers — a column's menu button, the toolbar's
 * league button — so this keeps the overlay wiring (positioning, outside-click, Escape) in one
 * place. Content is a plain `<ng-template>` in the declaring component, which means the
 * component's own styles and bindings still apply inside the overlay.
 */
const POPOVER_POSITIONS: Record<'start' | 'end', ConnectedPosition[]> = {
  start: [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  ],
  end: [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  ],
};

@Directive({
  selector: '[appPopover]',
  exportAs: 'appPopover',
  host: {
    '(click)': 'toggle()',
    '[attr.aria-expanded]': 'isOpen()',
    '[attr.aria-haspopup]': '"dialog"',
  },
})
export class PopoverTriggerDirective {
  private readonly overlay = inject(Overlay);
  private readonly positionBuilder = inject(OverlayPositionBuilder);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appPopover = input.required<TemplateRef<unknown>>();
  readonly popoverAlign = input<'start' | 'end'>('end');
  /** Lets one declared template serve every column, parameterised by the column it opened for. */
  readonly popoverContext = input<Record<string, unknown> | undefined>(undefined);

  readonly isOpen = signal(false);
  private overlayRef: OverlayRef | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.overlayRef) {
      return;
    }
    this.overlayRef = this.overlay.create({
      positionStrategy: this.positionBuilder
        .flexibleConnectedTo(this.host.nativeElement)
        .withPositions(POPOVER_POSITIONS[this.popoverAlign()])
        .withPush(true),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: 'app-popover-panel',
    });
    this.overlayRef.attach(
      new TemplatePortal(this.appPopover(), this.viewContainerRef, this.popoverContext()),
    );

    this.overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.close();
        this.host.nativeElement.focus();
      }
    });
    // The host's own click would otherwise re-open the popover we just dismissed.
    this.overlayRef.outsidePointerEvents().subscribe((event) => {
      if (!this.host.nativeElement.contains(event.target as Node)) {
        this.close();
      }
    });

    this.isOpen.set(true);
  }

  close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
  }
}
