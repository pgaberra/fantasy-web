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
  exportAs: 'appTooltip',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(click)': 'onClick()',
  },
})
export class TooltipDirective {
  private readonly overlay = inject(Overlay);
  private readonly positionBuilder = inject(OverlayPositionBuilder);
  private readonly ariaDescriber = inject(AriaDescriber);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appTooltip = input<string | null>(null);
  /**
   * Whether activating the trigger dismisses the bubble. It should: a tap synthesises
   * `mouseenter` but never a `mouseleave`, so on a phone a tooltip opened by tapping a button
   * stays painted over whatever that button just opened. Off for a trigger where the tap is
   * what opens the tooltip in the first place — see `app-help-tip`.
   */
  readonly dismissOnClick = input<boolean>(true);

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

  /**
   * For a trigger that must also answer a tap: a touch device fires no hover, and Safari does not
   * focus a button when it is tapped, so neither of the host listeners above ever runs there.
   */
  onClick(): void {
    if (this.dismissOnClick()) {
      this.hide();
    }
  }

  toggle(): void {
    if (this.overlayRef) {
      this.hide();
    } else {
      this.show();
    }
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
