import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
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

  it('names the season dropdown with a label the pointer can reach, not just a screen reader', () => {
    MockRender(WhosHotComponent);

    const label = ngMocks.find('label.season-label').nativeElement as HTMLLabelElement;
    const select = ngMocks.find('select.season-select').nativeElement as HTMLSelectElement;

    expect(label.textContent.trim()).toEqual('Season');
    // `for` and `id` rather than an aria-label: clicking the word focuses the control, and
    // the name is on screen for everyone rather than only for assistive tech.
    expect(label.htmlFor).toEqual(select.id);
    expect(select.getAttribute('aria-label')).toEqual(null);
  });

  it('asks for the season beside the page title, not inside the range bar', () => {
    MockRender(WhosHotComponent);

    // It frames every number on the page rather than only the stretch of games picked below it.
    const header = ngMocks.find('.page-header').nativeElement as HTMLElement;

    expect(header.querySelector('select.season-select')).toBeTruthy();
  });

  it('picks the season by the year it starts in, which is what the splits API takes', () => {
    const component = MockRender(WhosHotComponent).point.componentInstance;

    component.onSeasonChange({ target: { value: '2026' } } as unknown as Event);

    expect(component.season()).toEqual(2026);
  });

  it('ignores a season that is not a number rather than asking for an unnamed one', () => {
    const component = MockRender(WhosHotComponent).point.componentInstance;

    component.onSeasonChange({ target: { value: '' } } as unknown as Event);

    expect(component.season()).toEqual(2025);
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
