import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlayerPoolNoticeComponent } from './player-pool-notice';
import { PoolReconciliation } from '../../api/models/pool-reconciliation';

describe('PlayerPoolNoticeComponent', () => {
  beforeEach(() => MockBuilder(PlayerPoolNoticeComponent));

  function render(reconciliation: PoolReconciliation | null) {
    return MockRender(PlayerPoolNoticeComponent, { reconciliation });
  }

  /** A reconciliation that added this many players, ids 1..n. */
  const added = (count: number): PoolReconciliation => ({
    addedPlayerIds: Array.from({ length: count }, (_, i) => i + 1),
  });

  it('says how many players were added', () => {
    const fixture = render(added(12));

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('.pool-notice')).not.toBeNull();
    expect(text).toContain('12 players have been added');
    expect(text).toContain('Your existing projections are unchanged');
  });

  it('reads as one player for a single addition', () => {
    expect(render(added(1)).nativeElement.textContent as string).toContain(
      '1 player has been added',
    );
  });

  /**
   * Players who left the pool are the table's business, not this notice's — their rows are kept
   * and hidden, and saying "removed" here would claim something that did not happen.
   */
  it('says nothing about players leaving', () => {
    const text = render(added(12)).nativeElement.textContent as string;

    expect(text).not.toContain('removed');
  });

  // A read that had nothing to add still reports zero, which is not news.
  it('renders nothing when nothing was added', () => {
    expect(render(added(0)).nativeElement.querySelector('.pool-notice')).toBeNull();
    expect(render(null).nativeElement.querySelector('.pool-notice')).toBeNull();
  });

  it('asks to show the new players, and leaves the narrowing to the table', () => {
    const fixture = render(added(12));
    const shown = vi.fn();
    fixture.point.componentInstance.showNewPlayers.subscribe(shown);

    ngMocks.click(ngMocks.find(fixture, 'button.btn'));

    expect(shown).toHaveBeenCalledOnce();
    // Still on screen: the user may want the count and the caveat while looking at the rows.
    expect(fixture.nativeElement.querySelector('.pool-notice')).not.toBeNull();
  });

  it('goes away when dismissed', () => {
    const fixture = render(added(12));

    fixture.nativeElement.querySelector('.pool-notice__dismiss').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.pool-notice')).toBeNull();
  });
});
