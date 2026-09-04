import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** How long the page has to be still before the iOS path counts a scroll as over. */
const SCROLL_SETTLE_MS = 120;

/**
 * How far the page may move between two scroll events before the iOS path stops following it.
 * The header trails the rows by a frame or two of whatever the scroll is doing, so this is also
 * roughly how far off it is allowed to be: a finger dragging the page moves it a handful of
 * pixels a frame and the header swims a little behind, which reads as the header keeping up;
 * a flick moves it a hundred and the header lands on the wrong rows. Measured per event rather
 * than per millisecond because the browser already delivers at most one scroll event a frame.
 */
const FLICK_PX_PER_EVENT = 32;

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
 * iOS takes neither: the header follows a slow scroll, is hidden through a flick and placed once
 * the page rests, because there the pin cannot keep up with a flick however it is expressed
 * (`pinAtRest`).
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

      // `-webkit-touch-callout` exists on iOS WebKit and nowhere else — and on iOS every browser
      // is WebKit, Chrome included. It is the one engine where the pin cannot follow the scroll
      // however it is expressed, so it gets the third path below.
      if (CSS.supports('-webkit-touch-callout', 'none')) {
        this.pinAtRest(wrapper, head);
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
   * The iOS path: the header follows the page while it moves slowly enough to be followed, and
   * is hidden the moment it moves faster than that — a flick — until the page has come to rest,
   * where it is placed and faded back in.
   *
   * On iOS the page is scrolled by a thread the page's own code never runs on, and nothing we
   * can hand that thread describes this pin: `position: sticky` cannot reach past the horizontal
   * scroll container, and a scroll-driven animation is resolved with the rest of style there —
   * WebKit's `canBeAccelerated()` refuses any progress-based timeline until it has threaded
   * animations (Safari 26.4), and the report that led here came from a build that had them. So
   * whatever moves the header during a scroll trails the rows by however far the scroll got
   * ahead. Under a dragging finger that is a few pixels, and following is the right call; through
   * a flick it is rows, and a header sitting on the wrong rows is worse than none. Hiding it
   * costs nothing to get right — a frame late is invisible, where a frame late on a position is
   * a row out. Once hidden it stays hidden until the page rests, so a flick that is caught and
   * slowed does not flicker the header back at the wrong place.
   *
   * The identity cells inside the group are sticky (the frozen columns), and iOS places those
   * from the scrolling thread as well; `position: sticky` on the group itself is what keeps
   * them riding along with its translation (see the header component's stylesheet). This path
   * leaves that alone and only ever sets the transform between scrolls.
   */
  private pinAtRest(wrapper: HTMLElement, head: HTMLElement): void {
    // The timeline in `styles.css` would otherwise drive this same transform from the main
    // thread, which is the whole problem.
    head.style.animation = 'none';

    let inset = 0;
    const readInset = () => {
      inset = parseFloat(getComputedStyle(wrapper).getPropertyValue('--pinned-header-inset')) || 0;
    };
    let pinned = false;
    let hidden = false;
    let settle = 0;
    let lastTop: number | null = null;

    const place = () => {
      const wrapperBox = wrapper.getBoundingClientRect();
      const travel = Math.max(wrapperBox.height - head.offsetHeight, 0);
      const offset = Math.min(Math.max(inset - wrapperBox.top, 0), travel);
      lastTop = wrapperBox.top;
      pinned = offset > 0;
      head.style.transform = pinned ? `translateY(${offset}px)` : '';
      if (hidden) {
        hidden = false;
        // Set together with the opacity so the fade applies to this change and not the hide.
        head.style.transition = 'opacity 150ms ease-out';
        head.style.opacity = '';
      }
    };
    const onScroll = () => {
      clearTimeout(settle);
      settle = setTimeout(place, SCROLL_SETTLE_MS);
      if (hidden) {
        return;
      }
      const top = wrapper.getBoundingClientRect().top;
      const moved = lastTop === null ? 0 : Math.abs(top - lastTop);
      lastTop = top;
      if (moved <= FLICK_PX_PER_EVENT) {
        place();
        return;
      }
      // A header still at the top of the table scrolls with it, which is right; one held part-way
      // down is about to be on the wrong rows. Nothing is placed mid-flick either way.
      if (pinned) {
        hidden = true;
        head.style.transition = 'none';
        head.style.opacity = '0';
      }
    };
    const remeasure = () => {
      readInset();
      place();
    };

    const observer = new ResizeObserver(place);
    this.destroyRef.onDestroy(() => {
      clearTimeout(settle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', remeasure);
      observer.disconnect();
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    observer.observe(wrapper);
    readInset();
    place();
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
