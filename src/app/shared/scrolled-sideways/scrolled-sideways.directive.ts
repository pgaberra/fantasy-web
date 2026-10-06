import { Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/**
 * Says, as a class on the host, whether a sideways-scrolling box has been scrolled off its left
 * edge: `scrolled-sideways` while it has, nothing while it stands at the start.
 *
 * A table that scrolls sideways under a frozen first column changes state the moment it is
 * dragged: whatever stood left of the frozen column has gone under it. Anything else that
 * should go at that moment (a crest the frozen column can do without once the numbers are what
 * is being read) keys off this class, so it goes in the same movement rather than at some
 * second threshold of its own. CSS alone cannot say it: a scroll-driven animation would, but not
 * yet in every engine a phone runs.
 */
@Directive({
  selector: '[appScrolledSideways]',
  host: {
    '(scroll)': 'read()',
    '[class.scrolled-sideways]': 'scrolled()',
  },
})
export class ScrolledSidewaysDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly scrolled = signal(false);

  constructor() {
    // A box restored to where it was (back navigation, a re-render) is already scrolled, and
    // fires no event for it.
    afterNextRender(() => this.read());
  }

  read(): void {
    this.scrolled.set(this.host.nativeElement.scrollLeft > 0);
  }
}
