import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScrolledSidewaysDirective } from './scrolled-sideways.directive';

@Component({
  imports: [ScrolledSidewaysDirective],
  template: `<div class="table-scroll" appScrolledSideways><table></table></div>`,
})
class HostComponent {}

/** Puts a box at a scroll position jsdom will report back. */
function scrollAt(box: HTMLElement, position: number): void {
  Object.defineProperty(box, 'scrollLeft', { configurable: true, get: () => position });
}

describe('ScrolledSidewaysDirective', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  function render(startAt = 0) {
    const fixture = TestBed.createComponent(HostComponent);
    const box = fixture.nativeElement.querySelector('.table-scroll') as HTMLElement;
    scrollAt(box, startAt);
    fixture.detectChanges();
    return { fixture, box };
  }

  it('marks the box once it has been scrolled off its left edge, and unmarks it back there', () => {
    const { fixture, box } = render();
    expect(box.classList.contains('scrolled-sideways')).toBe(false);

    scrollAt(box, 40);
    box.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(box.classList.contains('scrolled-sideways')).toBe(true);

    scrollAt(box, 0);
    box.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(box.classList.contains('scrolled-sideways')).toBe(false);
  });

  it('reads a box that is already scrolled when it is drawn, without waiting for an event', async () => {
    const { fixture, box } = render(120);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(box.classList.contains('scrolled-sideways')).toBe(true);
  });
});
