import { Injectable } from '@angular/core';

interface ClosablePopover {
  close(restoreFocus?: boolean): void;
}

/**
 * The popovers currently on screen, so a dialog can clear them before it takes over.
 *
 * A popover closes itself when the pointer or focus leaves it, which covers every way a user
 * dismisses one. It does not cover a menu whose own control opens a dialog: the click was inside
 * the menu, so nothing tells it to go, and it is left hanging over the dialog it just raised.
 */
@Injectable({ providedIn: 'root' })
export class OpenPopovers {
  private readonly open = new Set<ClosablePopover>();

  add(popover: ClosablePopover): void {
    this.open.add(popover);
  }

  remove(popover: ClosablePopover): void {
    this.open.delete(popover);
  }

  /** Focus is about to belong to the dialog, so it is not restored to the trigger. */
  closeAll(): void {
    for (const popover of [...this.open]) {
      popover.close(false);
    }
  }
}
