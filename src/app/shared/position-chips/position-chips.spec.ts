import { MockBuilder, MockRender } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { PositionChipsComponent } from './position-chips';

describe('PositionChipsComponent', () => {
  beforeEach(() => MockBuilder(PositionChipsComponent));

  function chips(positions: string[]): HTMLElement[] {
    const fixture = MockRender(PositionChipsComponent, { positions });
    return Array.from(fixture.point.nativeElement.querySelectorAll('.pos-chip'));
  }

  it('draws one chip per position, coloured by position', () => {
    const shown = chips(['C', 'RW', 'D']);

    expect(shown.map((chip) => chip.textContent?.trim())).toEqual(['C', 'RW', 'D']);
    expect(shown.every((chip) => chip.classList.contains('pos-chip'))).toBe(true);
    expect(
      shown.map((chip) =>
        chip.classList.contains(`pos--${chip.textContent?.trim().toLowerCase()}`),
      ),
    ).toEqual([true, true, true]);
  });

  it('colours a goalie as a goalie', () => {
    expect(chips(['G'])[0].classList).toContain('pos--g');
  });
});
