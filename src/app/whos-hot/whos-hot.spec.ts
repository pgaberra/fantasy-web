import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { WhosHotComponent } from './whos-hot';
import { PlayerService } from '../services/player.service';
import { GameSpan, WhosHotService } from '../services/whos-hot.service';

/** Longer than the component's settle delay, so a settled range has had its chance to fetch. */
const AFTER_THE_DRAG_MS = 400;

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, AFTER_THE_DRAG_MS));
}

describe('WhosHotComponent', () => {
  const splits = vi.fn<(span: GameSpan) => ReturnType<WhosHotService['splits']>>(() => of([]));

  beforeEach(() => {
    localStorage.clear();
    splits.mockClear();
    return MockBuilder(WhosHotComponent)
      .mock(PlayerService, { getPlayers: () => of([]) })
      .mock(WhosHotService, { splits });
  });

  it('spends one request on the range a drag lands on, not on every game it passes', async () => {
    const fixture = MockRender(WhosHotComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    splits.mockClear();

    for (let game = 60; game >= 40; game--) {
      component.fromGame.set(game);
      fixture.detectChanges();
    }
    await settle();

    expect(splits).toHaveBeenCalledTimes(1);
    expect(splits.mock.calls[0][0]).toEqual(
      expect.objectContaining({ fromGame: 40, toGame: component.toGame() }),
    );
  });

  it('asks for nothing at all when a drag ends back where it started', async () => {
    const fixture = MockRender(WhosHotComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const started = component.fromGame();
    splits.mockClear();

    for (const game of [started - 1, started - 2, started - 1, started]) {
      component.fromGame.set(game);
      fixture.detectChanges();
    }
    await settle();

    expect(splits).not.toHaveBeenCalled();
  });
});
