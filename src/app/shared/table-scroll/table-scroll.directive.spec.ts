import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableScrollDirective } from './table-scroll.directive';

/** What the window is, per jsdom. Every rect below is placed against it. */
const WINDOW_HEIGHT = 768;
const FROZEN_COL_WIDTH = 90;

@Component({
  imports: [TableScrollDirective],
  template: `
    <div class="table-scroll">
      <div class="table-wrapper" appTableScroll="Player projections">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th class="summary-pts-col" style="position: sticky; right: 0">Total Points</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nathan MacKinnon</td>
              <td>306.7</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
class HostComponent {}

/** Puts a box at a scroll position jsdom will report back, and records what is written to it. */
function scrollAt(box: HTMLElement, position: number, onWrite = vi.fn()): void {
  let at = position;
  Object.defineProperty(box, 'scrollLeft', {
    configurable: true,
    get: () => at,
    set: (value: number) => {
      at = value;
      onWrite(value);
    },
  });
}

describe('TableScrollDirective', () => {
  let hasFinePointer = true;

  beforeEach(() => {
    hasFinePointer = true;
    // jsdom answers every media query with a flat no, which would mean the pinned bar is never
    // built and every test about it passes by not running. Which pointer is on the other end is
    // stated per test instead.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: hasFinePointer, media: query }) as MediaQueryList,
    );
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * jsdom lays nothing out, so the geometry the directive reads is supplied here: how much wider
   * the columns are than the box they are in, and where that box sits against the window.
   *
   * @param overflow how far the table can scroll sideways
   * @param at where the table is scrolled to
   * @param bottom where the table's bottom edge sits relative to the top of the window
   * @param frozen whether the summary column is stuck against the right edge, as it is from
   *   1024px up
   */
  function setup(overflow: number, { at = 0, bottom = WINDOW_HEIGHT + 400, frozen = true } = {}) {
    const fixture = TestBed.createComponent(HostComponent);
    const scroller = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;
    const scrollLeft = at;

    vi.spyOn(scroller, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(scroller, 'scrollWidth', 'get').mockReturnValue(1000 + overflow);
    // jsdom keeps `scrollLeft` at zero however it is written, so the table's scroll position is
    // held here instead: the point of most of this is what the two boxes write to each other.
    const scrollTo = vi.fn();
    scrollAt(scroller, scrollLeft, scrollTo);
    scroller.getBoundingClientRect = () =>
      ({ top: 40, bottom, left: 24, width: 1000, height: bottom - 40 }) as DOMRect;
    const summary = scroller.querySelector('.summary-pts-col') as HTMLElement;
    summary.getBoundingClientRect = () => ({ width: FROZEN_COL_WIDTH }) as DOMRect;
    if (!frozen) {
      summary.removeAttribute('style');
    }

    fixture.detectChanges();
    return {
      fixture,
      scroller,
      scrollTo,
      fade: () => document.querySelector<HTMLElement>('.table-scroll-fade'),
      bar: () => document.querySelector<HTMLElement>('.table-scroll-bar'),
    };
  }

  function scrollPage(): void {
    window.dispatchEvent(new Event('scroll'));
  }

  describe('reaching the columns without a mouse', () => {
    it('makes the scrolling box a named region the keyboard can reach', () => {
      const { scroller } = setup(600);

      expect(scroller.getAttribute('tabindex')).toEqual('0');
      expect(scroller.getAttribute('role')).toEqual('region');
      expect(scroller.getAttribute('aria-label')).toEqual('Player projections');
    });

    it('leaves a table whose columns all fit out of the tab order', () => {
      const { scroller } = setup(0);

      expect(scroller.hasAttribute('tabindex')).toBe(false);
      expect(scroller.hasAttribute('role')).toBe(false);
    });

    it('gives the box up once the columns fit again', () => {
      const { scroller } = setup(600);

      vi.spyOn(scroller, 'scrollWidth', 'get').mockReturnValue(1000);
      scrollPage();

      expect(scroller.hasAttribute('tabindex')).toBe(false);
    });
  });

  describe('the clipped edge', () => {
    it('shadows it while there are columns still to the right', () => {
      const { fade } = setup(600, { frozen: false });

      expect(fade()?.hidden).toBe(false);
    });

    it('leaves the edge to a column already frozen against it', () => {
      const { fade } = setup(600);

      expect(fade()?.hidden).toBe(true);
    });

    it('drops it once the last column is in view', () => {
      const { fade } = setup(600, { at: 600, frozen: false });
      scrollPage();

      expect(fade()?.hidden).toBe(true);
    });

    it('never draws one over a table that is all there', () => {
      const { fade } = setup(0, { frozen: false });

      expect(fade()?.hidden).toBe(true);
    });
  });

  describe('the pinned bar', () => {
    it("pins the scroll while the table's own bar is below the fold", () => {
      const { bar } = setup(600);

      expect(bar()?.hidden).toBe(false);
      expect(bar()?.style.left).toEqual('24px');
      expect(bar()?.style.width).toEqual('1000px');
    });

    it('gives the table as much to scroll over as the columns take', () => {
      const { bar } = setup(600);

      expect((bar()?.firstElementChild as HTMLElement).style.width).toEqual('1600px');
    });

    it("hands back over once the table's own bar is on screen", () => {
      const { bar } = setup(600, { bottom: WINDOW_HEIGHT - 100 });
      scrollPage();

      expect(bar()?.hidden).toBe(true);
    });

    it('is not drawn for a table with nothing to scroll', () => {
      const { bar } = setup(0);

      expect(bar()?.hidden).toBe(true);
    });

    it('scrolls the table when it is dragged', () => {
      const { bar, scrollTo } = setup(600);
      const pinned = bar() as HTMLElement;

      scrollAt(pinned, 420);
      pinned.dispatchEvent(new Event('scroll'));

      expect(scrollTo).toHaveBeenCalledWith(420);
    });

    it('leaves the table alone when the two already agree', () => {
      const { bar, scrollTo } = setup(600, { at: 420 });
      const pinned = bar() as HTMLElement;

      scrollAt(pinned, 420);
      pinned.dispatchEvent(new Event('scroll'));

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('is left to the finger on a touch screen', () => {
      hasFinePointer = false;
      const { bar } = setup(600);

      expect(bar()).toBeNull();
    });

    it('goes with the table it belongs to', () => {
      const { fixture, bar } = setup(600);

      fixture.destroy();

      expect(bar()).toBeNull();
      expect(document.querySelector('.table-scroll-fade')).toBeNull();
    });
  });
});
