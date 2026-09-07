import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * How far the table's bottom edge has to be past the bottom of the window before the pinned bar
 * takes over. A couple of pixels rather than none, so a fractional device pixel cannot flip the
 * pinned bar and the table's own one back and forth against each other.
 */
const HANDOVER_PX = 2;

/** Ignore a difference of less than this between the two scroll positions: they agree. */
const SCROLL_EPSILON_PX = 1;

/**
 * Puts a wide table's sideways scroll where it can be reached, and says that there is more of it.
 *
 * These tables scroll the page once, and `appPinnedTableHeader` holds the column headings against
 * the top of the window while it does (see that directive for why there is no inner scrolling
 * box). The other half of that decision was left undone: the scroll container's horizontal
 * scrollbar sits at the bottom of the *table*, which on a board of three hundred players is
 * thousands of pixels below the fold. A wheel mouse cannot reach the stat columns at all without
 * scrolling to the end of the list first, and nothing on screen says they are there.
 *
 * Three things follow from that, and they are one directive because they are one answer:
 *
 * - a bar pinned to the bottom of the window that scrolls the table sideways. It is shown only
 *   while the table's own bar is off-screen, so the two are never both in view, and only for a
 *   pointer that has scrollbars to aim at;
 * - the scroll container is made a focusable region while (and only while) it overflows, so the
 *   arrow keys can drive it. Chrome has focused scrollers by itself since 127; nothing else does,
 *   and WCAG 2.1.1 asks for it either way;
 * - a shadow over the clipped right edge, so what is cut off reads as columns passing under it
 *   rather than a table that ends oddly. It is left off where a column is frozen against that
 *   edge (the summary column, at >=1024px), which already draws one of its own.
 *
 * The host is the scroll container. Its parent has to be the `.table-scroll` shell, which is the
 * box the fade is positioned against and must be the table's own box, nothing wider.
 */
@Directive({
  selector: '[appTableScroll]',
})
export class TableScrollDirective {
  /** Names the scrollable region for a screen reader. The table's own heading, verbatim. */
  readonly regionLabel = input.required<string>({ alias: 'appTableScroll' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Width of the columns frozen against the right edge, if any: the shadow defers to them. */
  private frozenRight = 0;
  private isRegion = false;

  constructor() {
    afterNextRender(() => {
      const scroller = this.host.nativeElement;
      const fade = this.createFade(scroller.parentElement);
      const bar = this.createBar();
      const spacer = bar?.firstElementChild as HTMLElement | undefined;

      /** Everything that changes only when the table or the window does. */
      const measure = (): void => {
        this.frozenRight = frozenRightWidth(scroller);
        if (spacer) {
          // The same travel as the table itself: the bar's own scroll range is its spacer's width
          // less the width it is drawn at, which is the width of the table's visible box.
          spacer.style.width = `${scroller.scrollWidth}px`;
        }
        sync();
      };

      /** Everything that changes as either box scrolls. */
      const sync = (): void => {
        const box = scroller.getBoundingClientRect();
        const travel = scroller.scrollWidth - scroller.clientWidth;
        const overflows = travel > 1;

        this.setRegion(scroller, overflows);

        if (fade) {
          // Nothing to say where a column is frozen against that edge: it draws the same shadow
          // over the columns going under it whether or not this one is there.
          fade.hidden = !(overflows && !this.frozenRight && scroller.scrollLeft < travel - 1);
        }

        if (!bar) {
          return;
        }
        // Pinned only while the table's own bar is out of reach: below the fold, with some part
        // of the table on screen to scroll. Once the last row is in view the real bar is there.
        const reachable =
          overflows &&
          box.top < window.innerHeight &&
          box.bottom > window.innerHeight + HANDOVER_PX;
        bar.hidden = !reachable;
        if (!reachable) {
          return;
        }
        bar.style.left = `${box.left + scroller.clientLeft}px`;
        bar.style.width = `${scroller.clientWidth}px`;
        follow(bar, scroller.scrollLeft);
      };

      const driveTable = (): void => {
        if (bar) {
          follow(scroller, bar.scrollLeft);
        }
      };

      // The table growing under the bar changes how far it can travel: Show more, a column
      // toggled, a filter narrowing the rows. The table is observed as well as its box, because
      // a column appearing changes the scroll width without changing the container's size.
      const observer = new ResizeObserver(measure);
      const table = scroller.querySelector('table');

      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', sync);
        window.removeEventListener('resize', measure);
        scroller.removeEventListener('scroll', sync);
        bar?.removeEventListener('scroll', driveTable);
        observer.disconnect();
        fade?.remove();
        bar?.remove();
      });

      window.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', measure);
      scroller.addEventListener('scroll', sync, { passive: true });
      bar?.addEventListener('scroll', driveTable, { passive: true });
      observer.observe(scroller);
      if (table) {
        observer.observe(table);
      }
      measure();
    });
  }

  /**
   * Makes the container something the keyboard can reach and a screen reader can name, for as
   * long as there is anything to scroll. A container that fits its columns is neither: an empty
   * tab stop and a landmark around a table that is already all there.
   */
  private setRegion(scroller: HTMLElement, overflows: boolean): void {
    if (overflows === this.isRegion) {
      return;
    }
    this.isRegion = overflows;
    if (overflows) {
      scroller.setAttribute('tabindex', '0');
      scroller.setAttribute('role', 'region');
      scroller.setAttribute('aria-label', this.regionLabel());
    } else {
      scroller.removeAttribute('tabindex');
      scroller.removeAttribute('role');
      scroller.removeAttribute('aria-label');
    }
  }

  private createFade(shell: HTMLElement | null): HTMLElement | null {
    if (!shell) {
      return null;
    }
    const fade = document.createElement('div');
    fade.className = 'table-scroll-fade';
    fade.hidden = true;
    fade.setAttribute('aria-hidden', 'true');
    shell.append(fade);
    return fade;
  }

  /**
   * A second scrollbar for a table that already has one is only worth its keep where a scrollbar
   * is how sideways scrolling is done at all. A touch screen drags the columns with a finger and
   * draws no bar to pin; asking for one there would also put a scroll handler on iOS, the one
   * engine where the header pin already cannot keep up with a flick.
   *
   * It hangs off the body rather than the table's shell so that no ancestor can ever take it out
   * of the viewport's hands: a `transform` or a `filter` anywhere above would make `fixed` mean
   * fixed to *that* box, and the bar would ride away with the page.
   */
  private createBar(): HTMLElement | null {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return null;
    }
    const bar = document.createElement('div');
    bar.className = 'table-scroll-bar';
    bar.hidden = true;
    // The table itself is the scrollable region; this is a handle on it. Chrome makes a scroller
    // keyboard-focusable unless it is told otherwise, and a tab stop inside `aria-hidden` is a
    // stop the screen reader cannot account for.
    bar.tabIndex = -1;
    bar.setAttribute('aria-hidden', 'true');

    const spacer = document.createElement('div');
    spacer.className = 'table-scroll-bar-spacer';
    bar.append(spacer);
    document.body.append(bar);
    return bar;
  }
}

/**
 * Moves one box to where the other one is, unless it is already there.
 *
 * The two scroll each other, so the write has to stop somewhere: each side leaves the other alone
 * once they agree, and the echo of its own write finds nothing to do. A flag would not do it —
 * a scroll event arrives well after the `scrollLeft` that caused it, by which time the flag is
 * long since cleared.
 */
function follow(box: HTMLElement, position: number): void {
  if (Math.abs(box.scrollLeft - position) > SCROLL_EPSILON_PX) {
    box.scrollLeft = position;
  }
}

/**
 * How much of the right edge is taken by columns frozen against it.
 *
 * Read off the header rather than named, because which columns those are is a question for the
 * stylesheet: the summary column sticks only from 1024px up, and below that nothing does. Read
 * with the rest of the geometry, not per scroll.
 */
function frozenRightWidth(scroller: HTMLElement): number {
  const row = scroller.querySelector('thead')?.rows[0];
  if (!row) {
    return 0;
  }
  let width = 0;
  for (let i = row.cells.length - 1; i >= 0; i--) {
    const cell = row.cells[i];
    const style = getComputedStyle(cell);
    if (style.position !== 'sticky' || style.right === 'auto') {
      break;
    }
    width += cell.getBoundingClientRect().width;
  }
  return width;
}
