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
  beforeEach(() => {
    // jsdom lays nothing out, so the geometry the directive reads is supplied per test. Frames
    // run inline to keep the assertions on the same tick as the scroll that caused them.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => vi.restoreAllMocks());

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
});
