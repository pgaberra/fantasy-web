import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerPoolNoticeComponent } from './player-pool-notice';
import { PoolReconciliation } from '../../api/models/pool-reconciliation';

describe('PlayerPoolNoticeComponent', () => {
  beforeEach(() => MockBuilder(PlayerPoolNoticeComponent));

  function render(reconciliation: PoolReconciliation | null) {
    return MockRender(PlayerPoolNoticeComponent, { reconciliation });
  }

  it('says how many players were added and removed', () => {
    const fixture = render({ added: 12, removed: 3 });

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('.pool-notice')).not.toBeNull();
    expect(text).toContain('12 players added');
    expect(text).toContain('3 players removed');
  });

  it('leaves out the side that did not change', () => {
    const fixture = render({ added: 1, removed: 0 });

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('1 player added');
    expect(text).not.toContain('removed');
  });

  // The server reports a reconciliation only on the read that made one, but a read that had
  // nothing to move still reports zeros — which is not news.
  it('renders nothing when nothing moved', () => {
    expect(render({ added: 0, removed: 0 }).nativeElement.querySelector('.pool-notice')).toBeNull();
    expect(render(null).nativeElement.querySelector('.pool-notice')).toBeNull();
  });

  it('goes away when dismissed', () => {
    const fixture = render({ added: 12, removed: 3 });

    fixture.nativeElement.querySelector('.pool-notice__dismiss').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.pool-notice')).toBeNull();
  });
});
