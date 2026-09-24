import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { rowWindow } from './row-window';

@Component({
  template: `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
        </tr>
      </thead>
      <tbody #body>
        @for (row of drawn.rows(); track row) {
          <tr>
            <td>{{ row }}</td>
            <td>Player {{ row }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
class HostComponent {
  readonly list = signal(Array.from({ length: 1000 }, (_, index) => index));
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');
  readonly drawn = rowWindow(this.list, this.body);
}

/**
 * jsdom lays nothing out, so the geometry the window reads is given here: rows `rowPx` tall, the
 * page scrolled `scrolledPx` past the first row, and header cells as wide as `headerWidths` says.
 */
function layOut(host: HostComponent, fixture: { nativeElement: HTMLElement }, geometry: Geometry) {
  const body = fixture.nativeElement.querySelector('tbody')!;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === body) {
      const top = host.drawn.before() - geometry.scrolledPx;
      return { top, height: body.children.length * geometry.rowPx, width: 0 } as DOMRect;
    }
    const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
    return { top: 0, height: 0, width: geometry.headerWidths[index] ?? 0 } as DOMRect;
  });
}

interface Geometry {
  rowPx: number;
  scrolledPx: number;
  headerWidths: number[];
}

/** The page scrolled to where the geometry says, and every frame that follows run. */
async function settle(fixture: { detectChanges(): void }): Promise<void> {
  window.dispatchEvent(new Event('scroll'));
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    TestBed.tick();
    fixture.detectChanges();
  }
}

describe('rowWindow', () => {
  afterEach(() => vi.restoreAllMocks());

  const render = () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('draws the top of a long list before anything is measured', () => {
    const fixture = render();
    const host = fixture.componentInstance;

    expect(host.drawn.rows()[0]).toEqual(0);
    expect(host.drawn.rows().length).toBeLessThan(100);
    expect(host.drawn.before()).toEqual(0);
    expect(host.drawn.after()).toBeGreaterThan(0);
  });

  it('draws the rows around the screen, with spacers standing in for the rest', async () => {
    const fixture = render();
    const host = fixture.componentInstance;
    const geometry = { rowPx: 40, scrolledPx: 500 * 40, headerWidths: [30, 120] };
    layOut(host, fixture, geometry);

    await settle(fixture);

    const drawn = host.drawn.rows();
    const onScreen = Math.ceil(window.innerHeight / 40);
    expect(drawn[0]).toBeLessThanOrEqual(500);
    expect(drawn[drawn.length - 1]).toBeGreaterThanOrEqual(500 + onScreen);
    expect(drawn.length).toBeLessThan(onScreen + 50);
    // The spacers and the drawn rows add up to the whole list, at the measured row height.
    expect(host.drawn.before()).toEqual(host.drawn.start() * 40);
    expect(host.drawn.before() + drawn.length * 40 + host.drawn.after()).toEqual(1000 * 40);
    // Even starts, so the drawn rows keep the stripes they have in the whole list.
    expect(host.drawn.start() % 2).toEqual(0);
  });

  it('follows a list that shrinks under it', async () => {
    const fixture = render();
    const host = fixture.componentInstance;
    const geometry = { rowPx: 40, scrolledPx: 500 * 40, headerWidths: [] };
    layOut(host, fixture, geometry);
    await settle(fixture);

    // A filter leaves three rows, and the page, now much shorter, is back at the table's top.
    host.list.set([1, 2, 3]);
    geometry.scrolledPx = 0;
    await settle(fixture);

    expect(host.drawn.rows()).toEqual([1, 2, 3]);
    expect(host.drawn.before()).toEqual(0);
    expect(host.drawn.after()).toEqual(0);
  });

  it('keeps each column at the widest it has been, so rows scrolling past cannot shrink it', async () => {
    const fixture = render();
    const host = fixture.componentInstance;
    const geometry = { rowPx: 40, scrolledPx: 0, headerWidths: [30, 120] };
    layOut(host, fixture, geometry);
    await settle(fixture);

    const cells = fixture.nativeElement.querySelectorAll('th') as NodeListOf<HTMLElement>;
    expect(cells[1].style.minWidth).toEqual('120px');

    // A longer name scrolled in, then out again.
    geometry.headerWidths = [30, 150];
    geometry.scrolledPx = 300 * 40;
    await settle(fixture);
    geometry.headerWidths = [30, 110];
    geometry.scrolledPx = 0;
    await settle(fixture);

    expect(cells[1].style.minWidth).toEqual('150px');
  });
});
