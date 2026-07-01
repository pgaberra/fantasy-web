import {
  ComponentRef,
  DestroyRef,
  Directive,
  ElementRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { AriaDescriber } from '@angular/cdk/a11y';
import {
  ConnectedPosition,
  Overlay,
  OverlayPositionBuilder,
  OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { TooltipComponent } from './tooltip';

const TOOLTIP_POSITIONS: ConnectedPosition[] = [
  { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
  { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
];

@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
  },
})
export class TooltipDirective {
  private readonly overlay = inject(Overlay);
  private readonly positionBuilder = inject(OverlayPositionBuilder);
  private readonly ariaDescriber = inject(AriaDescriber);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appTooltip = input<string | null>(null);

  private overlayRef: OverlayRef | null = null;
  private bubbleRef: ComponentRef<TooltipComponent> | null = null;
  private describedText: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      this.setDescription(null);
    });
    effect(() => this.syncTo(this.appTooltip()));
  }

  show(): void {
    const text = this.appTooltip();
    if (!text || this.overlayRef) {
      return;
    }
    this.overlayRef = this.overlay.create({
      positionStrategy: this.positionBuilder
        .flexibleConnectedTo(this.host.nativeElement)
        .withPositions(TOOLTIP_POSITIONS)
        .withPush(true),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
    this.bubbleRef = this.overlayRef.attach(new ComponentPortal(TooltipComponent));
    this.bubbleRef.setInput('text', text);
  }

  hide(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.bubbleRef = null;
  }

  private syncTo(text: string | null): void {
    this.setDescription(text);
    if (!text) {
      this.hide();
    } else {
      this.bubbleRef?.setInput('text', text);
    }
  }

  private setDescription(text: string | null): void {
    if (this.describedText === text) {
      return;
    }
    const element = this.host.nativeElement;
    if (this.describedText) {
      this.ariaDescriber.removeDescription(element, this.describedText);
    }
    if (text) {
      this.ariaDescriber.describe(element, text);
    }
    this.describedText = text;
  }
}
