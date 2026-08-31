import { describe, expect, it } from 'vitest';
import { MockBuilder, MockRender } from 'ng-mocks';
import { PositionMenuComponent } from './position-menu';
import { SkaterPosition } from '../../../models/position.model';

function render(positions: SkaterPosition[], overridden = false) {
  const fixture = MockRender(PositionMenuComponent, {
    playerName: 'Jason Robertson',
    positions: new Set(positions),
    overridden,
  });
  return { fixture, menu: fixture.point.componentInstance };
}

describe('PositionMenuComponent', () => {
  beforeEach(() => MockBuilder(PositionMenuComponent));

  it('adds a position the pool does not report', () => {
    const { menu } = render(['LW']);
    const emitted: (SkaterPosition[] | null)[] = [];
    menu.positionsChanged.subscribe((value) => emitted.push(value));

    menu.toggle('RW');

    expect(emitted).toEqual([['LW', 'RW']]);
  });

  it('emits positions in the order the app lists them, not the order they were clicked', () => {
    const { menu } = render(['RW']);
    const emitted: (SkaterPosition[] | null)[] = [];
    menu.positionsChanged.subscribe((value) => emitted.push(value));

    menu.toggle('C');

    expect(emitted).toEqual([['C', 'RW']]);
  });

  it('removes a position the owner does not want', () => {
    const { menu } = render(['LW', 'RW']);
    const emitted: (SkaterPosition[] | null)[] = [];
    menu.positionsChanged.subscribe((value) => emitted.push(value));

    menu.toggle('RW');

    expect(emitted).toEqual([['LW']]);
  });

  /** A skater eligible nowhere is filtered out of every position, so the board loses them. */
  it('will not untick the last position a player has', () => {
    const { menu } = render(['C']);
    const emitted: (SkaterPosition[] | null)[] = [];
    menu.positionsChanged.subscribe((value) => emitted.push(value));

    expect(menu.isLocked('C')).toBe(true);
    menu.toggle('C');

    expect(emitted).toEqual([]);
  });

  it('offers the way back to the reported positions only once there is a correction', () => {
    expect(render(['C'], false).fixture.nativeElement.textContent).not.toContain(
      'Use reported positions',
    );
    expect(render(['C'], true).fixture.nativeElement.textContent).toContain(
      'Use reported positions',
    );
  });

  it('goes back to the reported positions', () => {
    const { menu } = render(['D'], true);
    const emitted: (SkaterPosition[] | null)[] = [];
    menu.positionsChanged.subscribe((value) => emitted.push(value));

    menu.useDefault();

    expect(emitted).toEqual([null]);
  });
});
