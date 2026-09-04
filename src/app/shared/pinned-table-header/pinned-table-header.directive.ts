import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Keeps a wide table's `<thead>` against the top of the window while the page scrolls past it.
 *
 * `position: sticky` cannot do this here. The host has to stay a horizontal scroll container for
 * the stat columns, and `overflow-x: auto` makes it the sticky element's scrollport on *both*
 * axes — so a sticky `thead` resolves against a box that never scrolls vertically and simply
 * rides away with the page. Translating the row group instead reproduces what sticky would do,
 * measured against the window, and costs nothing horizontally: the `thead` still lives inside
 * the scroll container, so it tracks `scrollLeft` on its own and the frozen rank/player cells
 * keep sticking as before.
 *
 * Where the browser has scroll-driven animations the translation is CSS, not code: a view
 * timeline on the wrapper drives the row group's `translateY` (see `styles.css`), which the
 * browser runs off the main thread. That is the difference between a header that keeps up with
 * a fast flick and one that trails the rows and catches up once the scroll stops — a scroll
 * handler cannot win that race, because the rows are moved by the compositor while it is still
 * waiting for its frame. All the timeline needs from here is how far the header may travel,
 * which changes only when the table under it does. Where the pin begins is named, not measured
 * — the table's own top edge crossing the top of the window — so nothing here holds a copy of
 * the window's height that the browser could then disagree with. Everything else is positional,
 * so the pin survives the page above the table reflowing.
 *
 * Browsers without scroll timelines fall back to doing the same arithmetic in a scroll handler.
 *
 * A page that floats its own bar over the top — the landing page's nav — sets
 * `--pinned-header-inset` to that bar's height, and the header comes to rest below it instead of
 * underneath it. Left unset it is zero, which is right for every page that scrolls its chrome away.
 */
@Directive({
  selector: '[appPinnedTableHeader]',
})
export class PinnedTableHeaderDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const wrapper = this.host.nativeElement;
      const head = wrapper.querySelector('thead');
      if (!head) {
        return;
      }

      // Both halves are asked for: an engine that understands view timelines but not the range
      // this pins against would drop the `animation-range` in `styles.css` and run the keyframes
      // across the table's whole passage through the window instead — worse than not pinning.
      if (
        CSS.supports('animation-timeline: view()') &&
        CSS.supports('animation-range', 'exit-crossing 0px')
      ) {
        this.measureForTimeline(wrapper, head);
      } else {
        this.pinOnScroll(wrapper, head);
      }
    });
  }

  /**
   * Feeds the CSS timeline the one distance it cannot work out for itself: how far the header
   * may travel before it would hang below the last row.
   *
   * Where the pin begins is deliberately not measured here. It used to be — a window height,
   * refreshed on every event that might have changed it — and a header pinned against a window
   * height that has since moved parks that many pixels down the table and stays there for the
   * rest of the scroll. The range in `styles.css` names the table's top edge crossing the top of
   * the window instead, which the browser resolves against the window it has at that moment, so
   * a zoom step or a phone collapsing its toolbars needs nothing from this file.
   */
  private measureForTimeline(wrapper: HTMLElement, head: HTMLElement): void {
    const measure = () => {
      const travel = Math.max(wrapper.getBoundingClientRect().height - head.offsetHeight, 0);

      wrapper.style.setProperty('--pinned-header-travel', `${travel}px`);
    };

    // Show more, a column toggled, a filter narrowing the rows — each changes how far the header
    // may travel. The header is observed too: its own height moves the stopping point as well.
    const observer = new ResizeObserver(measure);

    this.destroyRef.onDestroy(() => observer.disconnect());

    observer.observe(wrapper);
    observer.observe(head);
    measure();
  }

  /**
   * The pre-scroll-timeline path: work the same offset out from the window's own geometry every
   * time the page scrolls.
   *
   * The write is deliberately synchronous. It was once deferred to the next animation frame,
   * which is the usual way to keep a scroll handler cheap — but it also draws the header one
   * frame behind the rows it is meant to sit above, and a browser that stops serving frames
   * through a momentum scroll (phones do) leaves it behind for the whole flick, part-way down
   * the table, until the scroll stops. A rect read and a transform write are cheap enough to do
   * in the handler, and scroll events already arrive at most once per frame.
   */
  private pinOnScroll(wrapper: HTMLElement, head: HTMLElement): void {
    // Read once rather than on every scroll: it only moves with the breakpoint that sized the bar.
    let inset = 0;
    const readInset = () => {
      inset = parseFloat(getComputedStyle(wrapper).getPropertyValue('--pinned-header-inset')) || 0;
    };
    const pin = () => {
      const wrapperBox = wrapper.getBoundingClientRect();
      // Stop where the last row does: past that the header would hang under the table.
      const travel = Math.max(wrapperBox.height - head.offsetHeight, 0);
      const offset = Math.min(Math.max(inset - wrapperBox.top, 0), travel);
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
      // Deliberately no `will-change: transform` to go with it. It is the usual companion to a
      // transform that moves every frame, but this row group holds the sticky identity columns,
      // and promoting it stopped WebKit painting them at all — a header with its stat columns
      // and nothing where the rank and the player name belong.
    };
    const remeasure = () => {
      readInset();
      pin();
    };

    // Scroll and resize move the header relative to the window; the observer catches the table
    // growing under it — Show more, a column toggled, a filter narrowing the rows — which
    // changes how far the header may travel.
    const observer = new ResizeObserver(pin);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', pin);
      window.removeEventListener('resize', remeasure);
      observer.disconnect();
    });

    window.addEventListener('scroll', pin, { passive: true });
    window.addEventListener('resize', remeasure);
    observer.observe(wrapper);
    readInset();
    pin();
  }
}
