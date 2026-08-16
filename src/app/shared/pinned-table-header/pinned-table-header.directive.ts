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
 * A page that floats its own bar over the top — the landing page's nav — sets
 * `--pinned-header-inset` to that bar's height, and the header comes to rest below it instead of
 * underneath it. Left unset it is zero, which is right for every page that scrolls its chrome away.
 */
@Directive({
  selector: '[appPinnedTableHeader]',
})
export class PinnedTableHeaderDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const wrapper = this.host.nativeElement;
      const head = wrapper.querySelector('thead');
      if (!head) {
        return;
      }

      let frame = 0;
      let queued = false;
      // Read once rather than every frame: it only moves with the breakpoint that sized the bar.
      let inset = 0;
      const readInset = () => {
        inset =
          parseFloat(getComputedStyle(wrapper).getPropertyValue('--pinned-header-inset')) || 0;
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
      destroyRef.onDestroy(() => {
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
    });
  }
}
