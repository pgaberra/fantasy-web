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
 * which changes only when the table under it does. Everything else is positional, so the pin
 * survives the page above the table reflowing.
 *
 * Browsers without scroll timelines fall back to doing the same arithmetic a frame at a time.
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

      if (CSS.supports('animation-timeline: view()')) {
        this.measureForTimeline(wrapper, head);
      } else {
        this.pinPerFrame(wrapper, head);
      }
    });
  }

  /**
   * Feeds the CSS timeline the two distances it cannot work out for itself, both measured from
   * `cover 0%` — the moment the table's top edge meets the bottom of the window. The header
   * starts moving a window-height later, when that edge reaches the top instead, and stops once
   * it has travelled the height of the table beneath it.
   *
   * Neither depends on the scroll position, which is the point: the browser is left to follow
   * the scroll, and this runs only when the layout it measured has actually changed.
   */
  private measureForTimeline(wrapper: HTMLElement, head: HTMLElement): void {
    const measure = () => {
      const inset =
        parseFloat(getComputedStyle(wrapper).getPropertyValue('--pinned-header-inset')) || 0;
      const pinStart = document.documentElement.clientHeight - inset;
      const travel = Math.max(wrapper.getBoundingClientRect().height - head.offsetHeight, 0);

      wrapper.style.setProperty('--pinned-header-travel', `${travel}px`);
      wrapper.style.setProperty('--pinned-header-pin-start', `${pinStart}px`);
      wrapper.style.setProperty('--pinned-header-pin-end', `${pinStart + travel}px`);
    };

    // Show more, a column toggled, a filter narrowing the rows — each changes how far the header
    // may travel. The header is observed too: its own height moves the stopping point as well.
    // A resized window moves where the pin begins, and may resize the bar the page floats over
    // the top along with it.
    const observer = new ResizeObserver(measure);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    });

    window.addEventListener('resize', measure);
    observer.observe(wrapper);
    observer.observe(head);
    measure();
  }

  /** The pre-scroll-timeline path: recompute the offset on every frame the window scrolls. */
  private pinPerFrame(wrapper: HTMLElement, head: HTMLElement): void {
    let frame = 0;
    let queued = false;
    // Read once rather than every frame: it only moves with the breakpoint that sized the bar.
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
      head.style.willChange = offset > 0 ? 'transform' : '';
    };
    // Whether a frame is pending is tracked apart from its handle: the handle is only assigned
    // once requestAnimationFrame returns, which is too late to clear if the frame already ran.
    const schedule = () => {
      if (queued) {
        return;
      }
      queued = true;
      frame = requestAnimationFrame(() => {
        queued = false;
        pin();
      });
    };

    const remeasure = () => {
      readInset();
      schedule();
    };

    // Scroll and resize move the header relative to the window; the observer catches the table
    // growing under it — Show more, a column toggled, a filter narrowing the rows — which
    // changes how far the header may travel.
    const observer = new ResizeObserver(schedule);
    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', remeasure);
      observer.disconnect();
    });

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    observer.observe(wrapper);
    readInset();
    pin();
  }
}
