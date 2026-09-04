import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PinnedTableHeaderDirective } from './pinned-table-header.directive';

const HEAD_HEIGHT = 60;

@Component({
  imports: [PinnedTableHeaderDirective],
  template: `
    <div class="table-wrapper" appPinnedTableHeader>
      <table>
        <thead>
          <tr>
            <th>Player</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Nathan MacKinnon</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
class HostComponent {}

describe('PinnedTableHeaderDirective', () => {
  let supportsScrollTimelines = false;
  let isIos = false;

  beforeEach(() => {
    // jsdom lays nothing out, so the geometry the directive reads is supplied per test. Nothing
    // asks for an animation frame: a browser can stop serving them through a momentum scroll, so
    // the fallback writes the header's offset in the scroll handler itself. Frames are stubbed
    // out here to keep that honest — a test that only passed because one ran would fail.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    // Which of the two paths runs is stated per test rather than left to what jsdom claims to
    // support: the scroll handler below is the fallback, and every browser we ship to takes the
    // timeline instead.
    supportsScrollTimelines = false;
    isIos = false;
    vi.spyOn(CSS, 'supports').mockImplementation((property: string) =>
      property === '-webkit-touch-callout' ? isIos : supportsScrollTimelines,
    );
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** @param top where the table's top edge sits relative to the window */
  function setup(top: number, height = 1000, inset?: string) {
    const fixture = TestBed.createComponent(HostComponent);
    const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;
    const head = fixture.nativeElement.querySelector('thead') as HTMLElement;

    if (inset) {
      wrapper.style.setProperty('--pinned-header-inset', inset);
    }
    wrapper.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    vi.spyOn(head, 'offsetHeight', 'get').mockReturnValue(HEAD_HEIGHT);

    fixture.detectChanges();
    return { fixture, head };
  }

  function scroll(): void {
    window.dispatchEvent(new Event('scroll'));
  }

  it('leaves the header alone while the table is still below the top of the window', () => {
    const { head } = setup(120);
    scroll();

    expect(head.style.transform).toEqual('');
  });

  it('holds the header at the top of the window once the page scrolls past the table', () => {
    const { head } = setup(-250);
    scroll();

    expect(head.style.transform).toEqual('translateY(250px)');
  });

  /**
   * The offset used to be written from a `requestAnimationFrame` callback, which draws the header
   * a frame behind the rows it sits above — and on a phone, which stops serving frames through a
   * momentum scroll, leaves it part-way down the table for the length of the flick.
   */
  it('moves the header in the scroll handler rather than waiting for a frame', () => {
    const { head } = setup(-250);
    const framesBefore = vi.mocked(window.requestAnimationFrame).mock.calls.length;

    scroll();

    expect(head.style.transform).toEqual('translateY(250px)');
    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toEqual(framesBefore);
  });

  it('rests the header below a bar the page floats over its top', () => {
    const { head } = setup(-250, 1000, '61px');
    scroll();

    expect(head.style.transform).toEqual('translateY(311px)');
  });

  it('holds the header under that bar rather than pinning it while the table is still below', () => {
    const { head } = setup(200, 1000, '61px');
    scroll();

    expect(head.style.transform).toEqual('');
  });

  it('stops the header at the last row rather than letting it hang below the table', () => {
    const { head } = setup(-980, 1000);
    scroll();

    expect(head.style.transform).toEqual(`translateY(${1000 - HEAD_HEIGHT}px)`);
  });

  it('drops the transform again when the table scrolls back into place', () => {
    const { fixture, head } = setup(-250);
    scroll();
    expect(head.style.transform).toEqual('translateY(250px)');

    const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;
    wrapper.getBoundingClientRect = () => ({ top: 40, height: 1000 }) as DOMRect;
    scroll();

    expect(head.style.transform).toEqual('');
  });

  /**
   * The row group holds the sticky identity columns, and asking for it to be composited stopped
   * WebKit painting them: a header with its stat columns and nothing where the rank and the
   * player name belong. The pin is smoother on a promoted layer; the frozen columns are worth
   * more than that.
   */
  it('never promotes the header to its own layer, pinned or not', () => {
    const { head } = setup(-250);
    scroll();

    expect(head.style.transform).toEqual('translateY(250px)');
    expect(head.style.willChange).toEqual('');
  });

  it('stops tracking the window once the table is destroyed', () => {
    const { fixture, head } = setup(-250);
    scroll();

    const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;
    fixture.destroy();
    wrapper.getBoundingClientRect = () => ({ top: -800, height: 1000 }) as DOMRect;
    scroll();

    expect(head.style.transform).toEqual('translateY(250px)');
  });

  describe('where the browser drives animations from the scroll position', () => {
    beforeEach(() => {
      supportsScrollTimelines = true;
    });

    it('hands the timeline the distance the header may travel', () => {
      const { fixture } = setup(120, 1000);
      const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;

      expect(wrapper.style.getPropertyValue('--pinned-header-travel')).toEqual(
        `${1000 - HEAD_HEIGHT}px`,
      );
    });

    it('asks for no travel at all from a table no taller than its own header', () => {
      const { fixture } = setup(120, HEAD_HEIGHT - 10);
      const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;

      expect(wrapper.style.getPropertyValue('--pinned-header-travel')).toEqual('0px');
    });

    it('leaves the header itself alone, since the timeline is what follows the scroll', () => {
      const { head } = setup(-250);
      scroll();

      expect(head.style.transform).toEqual('');
    });

    /**
     * Where the pin begins is the window's height, and a copy of it kept here is a copy that can
     * go out of date — a zoom step, a phone collapsing its toolbars. The header then tracks the
     * scroll from a start point that is no longer the top of the window and parks that many
     * pixels down the table for the rest of the scroll. The range names the edge crossing
     * instead, so the only number handed over is the table's own.
     */
    it('hands the timeline nothing that a change of window height could invalidate', () => {
      const { fixture } = setup(120, 1000);
      const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;

      expect(wrapper.style.getPropertyValue('--pinned-header-pin-start')).toEqual('');
      expect(wrapper.style.getPropertyValue('--pinned-header-pin-end')).toEqual('');
    });

    it('stops measuring the table once it is destroyed', () => {
      const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');
      const { fixture } = setup(120, 1000);

      fixture.destroy();

      expect(disconnect).toHaveBeenCalled();
    });
  });

  describe('on iOS, where the page scrolls ahead of anything the pin could do', () => {
    beforeEach(() => {
      isIos = true;
      // iOS has the timelines too; it is the one engine where they are not taken.
      supportsScrollTimelines = true;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    it('switches the timeline pin off, since it would trail the rows from the main thread', () => {
      const { head } = setup(-250);

      expect(head.style.animation).toEqual('none');
    });

    it('places the header where the page has come to rest', () => {
      const { head } = setup(-250);

      expect(head.style.transform).toEqual('translateY(250px)');
      expect(head.style.opacity).toEqual('');
    });

    it('hides a pinned header the moment the page scrolls, and puts it back once it settles', () => {
      const { fixture, head } = setup(-250);
      const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;

      scroll();
      expect(head.style.opacity).toEqual('0');
      expect(head.style.transform).toEqual('translateY(250px)');

      wrapper.getBoundingClientRect = () => ({ top: -400, height: 1000 }) as DOMRect;
      scroll();
      vi.advanceTimersByTime(119);
      expect(head.style.opacity).toEqual('0');

      vi.advanceTimersByTime(1);
      expect(head.style.transform).toEqual('translateY(400px)');
      expect(head.style.opacity).toEqual('');
      expect(head.style.transition).toEqual('opacity 150ms ease-out');
    });

    it('leaves a header still in the flow of the table alone while the page scrolls', () => {
      const { head } = setup(120);

      scroll();

      expect(head.style.opacity).toEqual('');
      expect(head.style.transform).toEqual('');
    });

    it('lets the header go once the table scrolls back into view', () => {
      const { fixture, head } = setup(-250);
      const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;

      wrapper.getBoundingClientRect = () => ({ top: 40, height: 1000 }) as DOMRect;
      scroll();
      vi.advanceTimersByTime(120);

      expect(head.style.transform).toEqual('');
      expect(head.style.opacity).toEqual('');
    });

    it('stops placing the header once the table is destroyed', () => {
      const { fixture, head } = setup(-250);
      const wrapper = fixture.nativeElement.querySelector('.table-wrapper') as HTMLElement;

      fixture.destroy();
      wrapper.getBoundingClientRect = () => ({ top: -800, height: 1000 }) as DOMRect;
      scroll();
      vi.advanceTimersByTime(120);

      expect(head.style.transform).toEqual('translateY(250px)');
      expect(head.style.opacity).toEqual('');
    });
  });
});
