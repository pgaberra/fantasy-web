import { describe, expect, it } from 'vitest';
import { MockBuilder, MockRender } from 'ng-mocks';
import { PositionMenuComponent } from './position-menu';
import { SkaterPosition } from '../../../models/position.model';

function render(positions: SkaterPosition[], overridden = false, overriddenCount = 0) {
  const fixture = MockRender(PositionMenuComponent, {
    playerName: 'Jason Robertson',
    positions: new Set(positions),
    overridden,
    overriddenCount,
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

  it('offers the way back to the default positions only once there is a correction', () => {
    expect(render(['C'], false).fixture.nativeElement.textContent).not.toContain(
      'Use default positions',
    );
    expect(render(['C'], true, 1).fixture.nativeElement.textContent).toContain(
      'Use default positions',
    );
  });

  it('goes back to the default positions', () => {
    const { menu } = render(['D'], true, 1);
    const emitted: (SkaterPosition[] | null)[] = [];
    menu.positionsChanged.subscribe((value) => emitted.push(value));

    menu.useDefault();

    expect(emitted).toEqual([null]);
  });

  /**
   * The way out of a pool full of corrections, offered where someone is already standing when
   * they think about positions. The toolbar carries the same action, but only after a scan past
   * the search and filter controls.
   */
  it('offers to put every player back once another one is corrected', () => {
    expect(render(['C'], false, 2).fixture.nativeElement.textContent).toContain(
      'Reset every player to default',
    );
  });

  it('leaves it out when nothing at all is corrected', () => {
    expect(render(['C'], false, 0).fixture.nativeElement.textContent).not.toContain(
      'Reset every player to default',
    );
  });

  /** Two buttons doing the same thing is a choice the reader has to stop and make. */
  it('leaves it out when this player is the only one corrected', () => {
    const text = render(['LW'], true, 1).fixture.nativeElement.textContent;

    expect(text).toContain('Use default positions');
    expect(text).not.toContain('Reset every player to default');
  });

  it('asks for every player to go back to default', () => {
    const { menu } = render(['LW'], true, 3);
    let reset = 0;
    menu.allReset.subscribe(() => reset++);

    menu.resetAll();

    expect(reset).toEqual(1);
  });
});
