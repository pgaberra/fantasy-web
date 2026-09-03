import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { WhosHotComponent } from './whos-hot';
import { environment } from '../../environments/environment';
import { EntitlementService } from '../services/entitlement.service';
import { PlayerService } from '../services/player.service';
import { GameSpan, WhosHotService } from '../services/whos-hot.service';
import { WhosHotSettings, WhosHotSettingsService } from '../services/whos-hot-settings.service';

/** Longer than the component's settle delay, so a settled range has had its chance to fetch. */
const AFTER_THE_DRAG_MS = 400;

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, AFTER_THE_DRAG_MS));
}

describe('WhosHotComponent', () => {
  const splits = vi.fn<(span: GameSpan) => ReturnType<WhosHotService['splits']>>(() => of([]));

  /** Stands in for the live entitlement read, which is a fetch the page does not wait for. */
  const entitlement = {
    premium: signal(false),
    status: signal('none'),
    currentPeriodEnd: signal<string | null>(null),
    cancelAtPeriodEnd: signal(false),
    loadState: signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded'),
  };

  /** What the last visit left in this browser, or nothing on a first visit. */
  let stored: WhosHotSettings | null = null;

  const paymentsWereEnabled = environment.paymentsEnabled;

  afterEach(() => {
    environment.paymentsEnabled = paymentsWereEnabled;
  });

  beforeEach(() => {
    localStorage.clear();
    splits.mockClear();
    stored = null;
    entitlement.premium.set(false);
    entitlement.loadState.set('loaded');
    return MockBuilder(WhosHotComponent)
      .mock(PlayerService, { getPlayers: () => of([]) })
      .mock(WhosHotService, { splits })
      .mock(WhosHotSettingsService, { load: () => stored, save: () => undefined })
      .provide({ provide: EntitlementService, useValue: entitlement });
  });

  describe('the game range behind the paywall', () => {
    /** A range someone picked for themselves, which is the thing premium buys. */
    const customRange = () => ({ fromGame: 1, toGame: 82 }) as WhosHotSettings;

    it('leaves the range open to everyone while payments are switched off', () => {
      environment.paymentsEnabled = false;
      stored = customRange();

      const component = MockRender(WhosHotComponent).point.componentInstance;

      // Nobody can buy premium with the flag off, and /pricing redirects home, so locking the
      // control would make the range unbuyable rather than unbought.
      expect(component.canPickRange()).toEqual(true);
      expect(component.fromGame()).toEqual(1);
    });

    it('opens on the last 10 games, which is the range a free account is held to', () => {
      environment.paymentsEnabled = true;

      const component = MockRender(WhosHotComponent).point.componentInstance;

      expect(component.canPickRange()).toEqual(false);
      expect(component.fromGame()).toEqual(73);
      expect(component.toGame()).toEqual(82);
    });

    it('puts a lapsed account back on the free range, rather than stranding it on a custom one', () => {
      environment.paymentsEnabled = true;
      stored = customRange();

      const component = MockRender(WhosHotComponent).point.componentInstance;

      // The range is saved to the browser and outlives the subscription that bought it. Left
      // alone it would be a range they can no longer change, with every control that could
      // undo it switched off.
      expect(component.fromGame()).toEqual(73);
      expect(component.toGame()).toEqual(82);
    });

    it('keeps a premium account on the range it stored', () => {
      environment.paymentsEnabled = true;
      entitlement.premium.set(true);
      stored = customRange();

      const component = MockRender(WhosHotComponent).point.componentInstance;

      expect(component.canPickRange()).toEqual(true);
      expect(component.fromGame()).toEqual(1);
      expect(component.toGame()).toEqual(82);
    });

    it('waits for the entitlement to land before taking a stored range away', () => {
      environment.paymentsEnabled = true;
      entitlement.loadState.set('loading');
      stored = customRange();

      const fixture = MockRender(WhosHotComponent);
      const component = fixture.point.componentInstance;

      // The entitlement reads as non-premium until it lands, so acting on it early would snap a
      // paying subscriber's range back in the moment before their subscription is known.
      expect(component.fromGame()).toEqual(1);

      entitlement.premium.set(true);
      entitlement.loadState.set('loaded');
      fixture.detectChanges();

      expect(component.fromGame()).toEqual(1);
    });

    it('falls back once a failed entitlement read settles, rather than staying open on the error', () => {
      environment.paymentsEnabled = true;
      entitlement.loadState.set('loading');
      stored = customRange();

      const fixture = MockRender(WhosHotComponent);
      const component = fixture.point.componentInstance;

      entitlement.loadState.set('error');
      fixture.detectChanges();

      expect(component.canPickRange()).toEqual(false);
      expect(component.fromGame()).toEqual(73);
    });

    it('tells the range bar it is locked, rather than each of them asking separately', () => {
      environment.paymentsEnabled = true;

      MockRender(WhosHotComponent);

      const selector = ngMocks.find('app-game-range-selector');

      expect(ngMocks.input(selector, 'locked')).toEqual(true);
    });
  });

  describe('the minimum-games filter against a range that moved under it', () => {
    /** A premium account, so the range is the test's to move. */
    beforeEach(() => {
      environment.paymentsEnabled = false;
    });

    it('never asks for more games than the range holds', () => {
      stored = { fromGame: 1, toGame: 82, perGame: true, minGames: 25 } as WhosHotSettings;

      const fixture = MockRender(WhosHotComponent);
      const component = fixture.point.componentInstance;
      expect(component.appliedMinGames()).toEqual(25);

      // The same minimum against a stretch that cannot contain it would drop every player and
      // leave the leaderboard empty for a reason nothing on screen explains.
      component.fromGame.set(60);
      fixture.detectChanges();

      expect(component.appliedMinGames()).toEqual(23);
    });

    it('keeps the minimum the user chose, so widening the range brings it back', () => {
      stored = { fromGame: 1, toGame: 82, perGame: true, minGames: 25 } as WhosHotSettings;

      const fixture = MockRender(WhosHotComponent);
      const component = fixture.point.componentInstance;

      // A drag passes through every narrow range on its way to a wide one, so clamping the
      // stored number itself would let the trip destroy the setting.
      component.fromGame.set(80);
      fixture.detectChanges();
      expect(component.appliedMinGames()).toEqual(3);

      component.fromGame.set(1);
      fixture.detectChanges();

      expect(component.minGames()).toEqual(25);
      expect(component.appliedMinGames()).toEqual(25);
    });

    it('hands the clamped minimum to the range bar and the table alike', async () => {
      stored = { fromGame: 1, toGame: 82, perGame: true, minGames: 25 } as WhosHotSettings;

      const fixture = MockRender(WhosHotComponent);
      await fixture.whenStable();
      fixture.point.componentInstance.fromGame.set(60);
      fixture.detectChanges();

      // The box shows the number that is actually filtering, and the table filters by the
      // number the box shows, so the two can never disagree about what is being hidden.
      expect(ngMocks.input(ngMocks.find('app-game-range-selector'), 'minGames')).toEqual(23);
      expect(ngMocks.input(ngMocks.find('app-hot-players-table'), 'minGames')).toEqual(23);
    });

    it('clamps a stored minimum against the range stored beside it', () => {
      stored = { fromGame: 73, toGame: 82, perGame: true, minGames: 40 } as WhosHotSettings;

      const component = MockRender(WhosHotComponent).point.componentInstance;

      expect(component.appliedMinGames()).toEqual(10);
    });
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
