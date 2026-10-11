import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { WhosHotComponent } from './whos-hot';
import { EntitlementService } from '../services/entitlement.service';
import { FeatureService } from '../services/feature.service';
import { PlayerService } from '../services/player.service';
import { GameSpan, RosterLeague, WhosHotService } from '../services/whos-hot.service';
import { WhosHotSettings, WhosHotSettingsService } from '../services/whos-hot-settings.service';
import { SplitSeasonListResponse } from '../api/models/split-season-list-response';
import { HotPlayersTableComponent } from './hot-players-table/hot-players-table';
import { HotPlayer } from '../services/whos-hot.service';
import { Player } from '../models/player.model';
import { GoalieStats } from '../models/projection.model';

/** Longer than the component's settle delay, so a settled range has had its chance to fetch. */
const AFTER_THE_DRAG_MS = 400;

/** The summer before 2026-27: last season finished at 82 games, the next one has none yet. */
const SUMMER: SplitSeasonListResponse = {
  defaultSeason: 2025,
  seasons: [
    { season: 2026, scheduleGames: 84, gamesPlayed: 0 },
    { season: 2025, scheduleGames: 82, gamesPlayed: 82 },
  ],
};

/** November 2026: the furthest team has played twelve of its 84. */
const NOVEMBER: SplitSeasonListResponse = {
  defaultSeason: 2026,
  seasons: [
    { season: 2026, scheduleGames: 84, gamesPlayed: 12 },
    { season: 2025, scheduleGames: 82, gamesPlayed: 82 },
  ],
};

/** Opening night of 2026-27: the furthest team has played once, and half the league not at all. */
const OPENING_NIGHT: SplitSeasonListResponse = {
  defaultSeason: 2026,
  seasons: [
    { season: 2026, scheduleGames: 84, gamesPlayed: 1 },
    { season: 2025, scheduleGames: 82, gamesPlayed: 82 },
  ],
};

/** The fifth night: the furthest team has five games in. */
const FIFTH_NIGHT: SplitSeasonListResponse = {
  defaultSeason: 2026,
  seasons: [
    { season: 2026, scheduleGames: 84, gamesPlayed: 5 },
    { season: 2025, scheduleGames: 82, gamesPlayed: 82 },
  ],
};

function poolGoalie(id: number, name: string, teamAbbrev: string): Player {
  return { type: 'goalie', id, name, teamAbbrev, stats: {} as GoalieStats };
}

/** A goalie the server measured in the range: one game, one win. */
function measuredGoalie(playerId: number, name: string): HotPlayer {
  const scoring = { gs: 1, w: 1, l: 0, otl: 0, sho: 0, sa: 25, sv: 24, ga: 1 };
  return {
    name,
    teamAbbrev: 'BOS',
    games: 1,
    projection: {
      type: 'goalie',
      playerId,
      stats: {
        scoring: { ...scoring, gaa: 1, svPct: 0.96, winPct: 1, toi: 3600 },
        utility: { gp: 1 },
      },
    },
  };
}

describe('WhosHotComponent', () => {
  const splits = vi.fn<(span: GameSpan) => ReturnType<WhosHotService['splits']>>(() => of([]));
  let seasonsAnswer: SplitSeasonListResponse = SUMMER;
  const seasons = vi.fn(() => of(seasonsAnswer));
  const save = vi.fn<(settings: WhosHotSettings) => void>();
  const rosteredPlayerIds = vi.fn<
    (league: RosterLeague) => ReturnType<WhosHotService['rosteredPlayerIds']>
  >(() => of(new Set<number>()));

  /** What the BFF says this environment serves, which the switch below follows. */
  const features = { whosHotAvailableFilter: signal(true) };

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

  /** The player pool, which the board is filled out from when a range reaches before game 1. */
  let pool: Player[] = [];

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    localStorage.clear();
    splits.mockClear();
    splits.mockImplementation(() => of([]));
    seasons.mockClear();
    save.mockClear();
    rosteredPlayerIds.mockClear();
    rosteredPlayerIds.mockImplementation(() => of(new Set<number>()));
    features.whosHotAvailableFilter.set(true);
    seasonsAnswer = SUMMER;
    stored = null;
    pool = [];
    entitlement.premium.set(false);
    entitlement.loadState.set('loaded');
    return MockBuilder(WhosHotComponent)
      .mock(PlayerService, { getPlayers: () => of(pool) })
      .mock(WhosHotService, { splits, seasons, rosteredPlayerIds })
      .mock(WhosHotSettingsService, { load: () => stored, save })
      .provide({ provide: EntitlementService, useValue: entitlement })
      .provide({ provide: FeatureService, useValue: features });
  });

  /** Rendered, with the seasons and the effects that follow them given their turn. */
  async function renderSettled() {
    const fixture = MockRender(WhosHotComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  /**
   * The drag tests count requests around a debounce, so they own the clock from the first render.
   * On real timers a busy machine let an earlier range's fetch land after the count was reset,
   * and a drag that went nowhere read as one request.
   */
  async function renderOnFakeTimers() {
    vi.useFakeTimers();
    const fixture = MockRender(WhosHotComponent);
    await settle(fixture);
    return fixture;
  }

  /** Lets the range's settle delay run out, then the effects the settled range triggers. */
  async function settle(fixture: ReturnType<typeof MockRender<WhosHotComponent>>) {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(AFTER_THE_DRAG_MS);
    fixture.detectChanges();
  }

  describe('the game range behind the paywall', () => {
    /** A range someone picked for themselves, which is the thing premium buys. */
    const customRange = () => ({ fromGame: 1, toGame: 82, lastGames: null }) as WhosHotSettings;

    it('opens on the last 5 games, which is the range a free account is held to', async () => {
      const component = (await renderSettled()).point.componentInstance;

      expect(component.canPickRange()).toEqual(false);
      expect(component.lastGames()).toEqual(5);
      expect(component.fromGame()).toEqual(78);
      expect(component.toGame()).toEqual(82);
    });

    it('puts a lapsed account back on the free range, rather than stranding it on a custom one', async () => {
      stored = customRange();

      const component = (await renderSettled()).point.componentInstance;

      // The range is saved to the browser and outlives the subscription that bought it. Left
      // alone it would be a range they can no longer change, with every control that could
      // undo it switched off.
      expect(component.lastGames()).toEqual(5);
      expect(component.fromGame()).toEqual(78);
      expect(component.toGame()).toEqual(82);
    });

    it('keeps a premium account on the range it stored', async () => {
      entitlement.premium.set(true);
      stored = customRange();

      const component = (await renderSettled()).point.componentInstance;

      expect(component.canPickRange()).toEqual(true);
      expect(component.lastGames()).toEqual(null);
      expect(component.fromGame()).toEqual(1);
      expect(component.toGame()).toEqual(82);
    });

    it('waits for the entitlement to land before taking a stored range away', async () => {
      entitlement.loadState.set('loading');
      stored = customRange();

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;

      // The entitlement reads as non-premium until it lands, so acting on it early would snap a
      // paying subscriber's range back in the moment before their subscription is known.
      expect(component.fromGame()).toEqual(1);

      entitlement.premium.set(true);
      entitlement.loadState.set('loaded');
      fixture.detectChanges();

      expect(component.fromGame()).toEqual(1);
    });

    it('falls back once a failed entitlement read settles, rather than staying open on the error', async () => {
      entitlement.loadState.set('loading');
      stored = customRange();

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;

      entitlement.loadState.set('error');
      fixture.detectChanges();

      expect(component.canPickRange()).toEqual(false);
      expect(component.fromGame()).toEqual(78);
    });

    it('tells the range bar it is locked, rather than each of them asking separately', async () => {
      await renderSettled();

      const selector = ngMocks.find('app-game-range-selector');

      expect(ngMocks.input(selector, 'locked')).toEqual(true);
    });
  });

  describe('the season the page measures', () => {
    it('opens on the season the server says has games, which is last season in the summer', async () => {
      const component = (await renderSettled()).point.componentInstance;

      expect(component.season()).toEqual(2025);
      expect(component.scheduleLength()).toEqual(82);
    });

    it('moves on to the new season by itself once it is underway', async () => {
      seasonsAnswer = NOVEMBER;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.season()).toEqual(2026);
    });

    it('measures 2026-27 against its own 84 games, not 2025-26 ones', async () => {
      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;

      component.onSeasonChange({ target: { value: '2026' } } as unknown as Event);
      fixture.detectChanges();

      expect(component.scheduleLength()).toEqual(84);
      expect(ngMocks.input(ngMocks.find('app-game-range-selector'), 'scheduleLength')).toEqual(84);
    });

    it('asks for the last 5 as a count in a season underway, where each team is on its own game', async () => {
      seasonsAnswer = NOVEMBER;

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;

      expect(splits).toHaveBeenCalledWith({ season: 2026, lastGames: 5 });
      // And the rail shows it where it falls, not at games 80-84, which nobody has played.
      expect(component.fromGame()).toEqual(8);
      expect(component.toGame()).toEqual(12);
    });

    it('remembers no season until the visitor picks one, so a summer visit does not pin it', async () => {
      const fixture = await renderSettled();

      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ season: null }));

      fixture.point.componentInstance.onSeasonChange({
        target: { value: '2026' },
      } as unknown as Event);
      fixture.detectChanges();

      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ season: 2026 }));
    });

    it('pulls a range kept from an 84-game season back inside an 82-game one', async () => {
      entitlement.premium.set(true);
      stored = { season: 2025, fromGame: 80, toGame: 84, lastGames: null } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.toGame()).toEqual(82);
    });
  });

  describe('a range carried into another season', () => {
    /** A premium account, so the range is the test's to set. */
    beforeEach(() => {
      entitlement.premium.set(true);
    });

    const switchTo = (fixture: ReturnType<typeof MockRender<WhosHotComponent>>, year: number) => {
      fixture.point.componentInstance.onSeasonChange({
        target: { value: String(year) },
      } as unknown as Event);
      fixture.detectChanges();
    };

    it('goes back to the last 5 in a season that has not reached the range yet', async () => {
      seasonsAnswer = OPENING_NIGHT;
      stored = { season: 2025, fromGame: 38, toGame: 59, lastGames: null } as WhosHotSettings;

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;
      expect([component.fromGame(), component.toGame()]).toEqual([38, 59]);

      switchTo(fixture, 2026);

      // Games 38-59 of a season one night old is a board with nobody on it.
      expect(component.lastGames()).toEqual(5);
      expect([component.fromGame(), component.toGame()]).toEqual([0, 1]);
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ lastGames: 5 }));
    });

    it('does the same when the season the page follows moves on between visits', async () => {
      // Saved while the page followed 2025-26, read back once the server has moved on to 2026-27.
      seasonsAnswer = OPENING_NIGHT;
      stored = { season: null, fromGame: 38, toGame: 59, lastGames: null } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.season()).toEqual(2026);
      expect(component.lastGames()).toEqual(5);
      // Checked before the first request, so the range it gave up is never asked about.
      expect(splits).toHaveBeenCalledTimes(1);
      expect(splits).toHaveBeenCalledWith({ season: 2026, lastGames: 5 });
    });

    it('keeps a range the season it moves to has reached', async () => {
      seasonsAnswer = NOVEMBER;
      stored = { season: 2025, fromGame: 5, toGame: 20, lastGames: null } as WhosHotSettings;

      const fixture = await renderSettled();
      switchTo(fixture, 2026);

      // Twelve games in, games 5-20 still has games 5-12 to show.
      const component = fixture.point.componentInstance;
      expect(component.lastGames()).toEqual(null);
      expect([component.fromGame(), component.toGame()]).toEqual([5, 20]);
    });

    it('keeps the range in a season yet to start, which says so on the board itself', async () => {
      stored = { season: 2025, fromGame: 38, toGame: 59, lastGames: null } as WhosHotSettings;

      const fixture = await renderSettled();
      switchTo(fixture, 2026);

      // A look at next season in the summer must not cost the range this one was read over.
      const component = fixture.point.componentInstance;
      expect(component.lastGames()).toEqual(null);
      expect([component.fromGame(), component.toGame()]).toEqual([38, 59]);

      switchTo(fixture, 2025);
      expect([component.fromGame(), component.toGame()]).toEqual([38, 59]);
    });

    it('leaves a handle dragged past the latest game where it was put', async () => {
      seasonsAnswer = NOVEMBER;
      stored = { season: 2026, fromGame: 1, toGame: 12, lastGames: null } as WhosHotSettings;

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;

      // Only a change of season is checked: the range moving within one is the visitor's own.
      component.fromGame.set(30);
      component.toGame.set(40);
      fixture.detectChanges();

      expect(component.lastGames()).toEqual(null);
      expect([component.fromGame(), component.toGame()]).toEqual([30, 40]);
    });

    it('draws the full season against the season it is shown in', async () => {
      seasonsAnswer = NOVEMBER;
      stored = {
        season: 2025,
        fromGame: 0,
        toGame: 82,
        lastGames: null,
        seasonSpan: 'fullSeason',
      } as WhosHotSettings;

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;
      expect([component.fromGame(), component.toGame()]).toEqual([0, 82]);

      switchTo(fixture, 2026);

      // Kept as games 0-82 it left out the last two of an 84-game season.
      expect(component.seasonSpan()).toEqual('fullSeason');
      expect([component.fromGame(), component.toGame()]).toEqual([0, 84]);

      switchTo(fixture, 2025);
      expect([component.fromGame(), component.toGame()]).toEqual([0, 82]);
    });

    it('goes back to the last 5 from a second half the season has not reached', async () => {
      seasonsAnswer = NOVEMBER;
      stored = {
        season: 2025,
        fromGame: 42,
        toGame: 82,
        lastGames: null,
        seasonSpan: 'secondHalf',
      } as WhosHotSettings;

      const fixture = await renderSettled();
      switchTo(fixture, 2026);

      // 2026-27's second half starts at game 43, and the furthest team has played twelve.
      const component = fixture.point.componentInstance;
      expect(component.seasonSpan()).toEqual(null);
      expect(component.lastGames()).toEqual(5);
      expect([component.fromGame(), component.toGame()]).toEqual([8, 12]);
    });

    it('lets go of the season pill when a lapsed account is put back on the last 5', async () => {
      entitlement.premium.set(false);
      stored = {
        fromGame: 0,
        toGame: 82,
        lastGames: null,
        seasonSpan: 'fullSeason',
      } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

      // Left kept, the pill would redraw the rail over the last 5 it was put back on.
      expect(component.seasonSpan()).toEqual(null);
      expect(component.lastGames()).toEqual(5);
      expect([component.fromGame(), component.toGame()]).toEqual([78, 82]);
    });
  });

  describe('players yet to play, early in a season', () => {
    const SWAYMAN = 3;
    const VASILEVSKIY = 2;

    /** Boston has played and Tampa has not; the server can only answer for Boston's goalie. */
    beforeEach(() => {
      pool = [
        poolGoalie(SWAYMAN, 'Jeremy Swayman', 'BOS'),
        poolGoalie(VASILEVSKIY, 'Andrei Vasilevskiy', 'TB'),
      ];
      splits.mockImplementation(() => of([measuredGoalie(SWAYMAN, 'Jeremy Swayman')]));
    });

    const boardIds = (component: WhosHotComponent) =>
      component.hotPlayers().map((hot) => hot.projection.playerId);

    it('opens the last 5 after one night on games 0-1, with the teams yet to play at zero', async () => {
      seasonsAnswer = OPENING_NIGHT;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.fromGame()).toEqual(0);
      expect(component.toGame()).toEqual(1);
      // Still asked as a count: the server resolves each team's own last 5.
      expect(splits).toHaveBeenCalledWith({ season: 2026, lastGames: 5 });
      // Drawn as 1-1, the board left Vasilevskiy off it entirely.
      expect(boardIds(component)).toEqual([SWAYMAN, VASILEVSKIY]);
      expect(component.hotPlayers()[1].games).toEqual(0);
    });

    it('starts the last 5 at game 1 on the fifth night, and lists only who dressed', async () => {
      seasonsAnswer = FIFTH_NIGHT;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.fromGame()).toEqual(1);
      expect(component.toGame()).toEqual(5);
      expect(boardIds(component)).toEqual([SWAYMAN]);
    });

    it('asks the server from game 1 for a range the visitor starts before it', async () => {
      entitlement.premium.set(true);
      seasonsAnswer = OPENING_NIGHT;
      stored = { fromGame: 0, toGame: 1, lastGames: null } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

      // The server measures games, and there is no game 0 to measure.
      expect(splits).toHaveBeenCalledWith({ season: 2026, fromGame: 1, toGame: 1 });
      expect(boardIds(component)).toEqual([SWAYMAN, VASILEVSKIY]);
    });

    it('still says a season has not started, rather than listing the pool at zero', async () => {
      entitlement.premium.set(true);
      splits.mockImplementation(() => of([]));
      stored = { season: 2026, fromGame: 0, toGame: 10, lastGames: null } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.includesPlayersYetToPlay()).toEqual(false);
      expect(component.hotPlayers()).toEqual([]);
    });
  });

  describe('the minimum-games filter against a range that moved under it', () => {
    /** A premium account, so the range is the test's to move. */
    beforeEach(() => {
      entitlement.premium.set(true);
    });

    it('never asks for more games than the range holds', async () => {
      stored = { fromGame: 1, toGame: 82, perGame: true, minGames: 25 } as WhosHotSettings;

      const fixture = await renderSettled();
      const component = fixture.point.componentInstance;
      expect(component.appliedMinGames()).toEqual(25);

      // The same minimum against a stretch that cannot contain it would drop every player and
      // leave the leaderboard empty for a reason nothing on screen explains.
      component.fromGame.set(60);
      fixture.detectChanges();

      expect(component.appliedMinGames()).toEqual(23);
    });

    it('keeps the minimum the user chose, so widening the range brings it back', async () => {
      stored = { fromGame: 1, toGame: 82, perGame: true, minGames: 25 } as WhosHotSettings;

      const fixture = await renderSettled();
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

    it('shows the chosen minimum in the range bar and filters the table by the clamped one', async () => {
      stored = { fromGame: 1, toGame: 82, perGame: true, minGames: 25 } as WhosHotSettings;

      const fixture = await renderSettled();
      fixture.point.componentInstance.fromGame.set(60);
      fixture.detectChanges();

      // Moving the range must not change the number in the box; only the filter behind it
      // is held to what the narrower stretch can contain.
      expect(ngMocks.input(ngMocks.find('app-game-range-selector'), 'minGames')).toEqual(25);
      expect(ngMocks.input(ngMocks.find('app-hot-players-table'), 'minGames')).toEqual(23);
    });

    it('counts no game for a start before the first one', async () => {
      stored = { fromGame: 0, toGame: 3, perGame: true, minGames: 25 } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

      expect(component.appliedMinGames()).toEqual(3);
    });

    it('clamps a stored minimum against the range stored beside it', async () => {
      stored = { fromGame: 73, toGame: 82, perGame: true, minGames: 40 } as WhosHotSettings;

      const component = (await renderSettled()).point.componentInstance;

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

  it('ignores a season that is not a number rather than asking for an unnamed one', async () => {
    const component = (await renderSettled()).point.componentInstance;

    component.onSeasonChange({ target: { value: '' } } as unknown as Event);

    expect(component.season()).toEqual(2025);
  });

  it('spends one request on the range a drag lands on, not on every game it passes', async () => {
    entitlement.premium.set(true);
    const fixture = await renderOnFakeTimers();
    const component = fixture.point.componentInstance;
    // A handle moving is what turns "the last 5" into an explicit range.
    component.lastGames.set(null);
    await settle(fixture);
    splits.mockClear();

    for (let game = 60; game >= 40; game--) {
      component.fromGame.set(game);
      fixture.detectChanges();
    }
    await settle(fixture);

    expect(splits).toHaveBeenCalledTimes(1);
    expect(splits.mock.calls[0][0]).toEqual(
      expect.objectContaining({ fromGame: 40, toGame: component.toGame() }),
    );
  });

  it('asks for nothing at all when a drag ends back where it started', async () => {
    entitlement.premium.set(true);
    const fixture = await renderOnFakeTimers();
    const component = fixture.point.componentInstance;
    component.lastGames.set(null);
    await settle(fixture);
    const started = component.fromGame();
    splits.mockClear();

    for (const game of [started - 1, started - 2, started - 1, started]) {
      component.fromGame.set(game);
      fixture.detectChanges();
    }
    await settle(fixture);

    expect(splits).not.toHaveBeenCalled();
  });
  it('keeps the table, and the filters it holds, while a new range loads', async () => {
    entitlement.premium.set(true);
    const fixture = await renderOnFakeTimers();
    const component = fixture.point.componentInstance;
    const before = ngMocks.findInstance(HotPlayersTableComponent);
    expect(ngMocks.input(ngMocks.find('app-hot-players-table'), 'rowsPending')).toBe(false);

    const answer = new Subject<HotPlayer[]>();
    splits.mockReturnValueOnce(answer);
    component.lastGames.set(10);
    await settle(fixture);

    // Mid-fetch: the rows wait, the table does not go anywhere.
    expect(ngMocks.findInstance(HotPlayersTableComponent)).toBe(before);
    expect(ngMocks.input(ngMocks.find('app-hot-players-table'), 'rowsPending')).toBe(true);

    answer.next([]);
    answer.complete();
    await settle(fixture);

    expect(ngMocks.findInstance(HotPlayersTableComponent)).toBe(before);
    expect(ngMocks.input(ngMocks.find('app-hot-players-table'), 'rowsPending')).toBe(false);
  });

  describe('available players only', () => {
    const YAHOO = { leagueName: 'HHL', leagueKey: '465.l.9', syncedAt: 't' };
    const ESPN = { leagueName: 'Puck Club', leagueId: '123', syncedAt: 't' };

    const table = () => ngMocks.find('app-hot-players-table');

    it('is not offered before a league is synced, since nobody can be taken yet', async () => {
      stored = { fromGame: 1, toGame: 82, availableOnly: true } as WhosHotSettings;
      await renderSettled();

      expect(ngMocks.input(table(), 'availableFilter')).toBe(false);
      expect(rosteredPlayerIds).not.toHaveBeenCalled();
    });

    it('is not offered where the environment does not serve it', async () => {
      features.whosHotAvailableFilter.set(false);
      stored = {
        fromGame: 1,
        toGame: 82,
        yahooSync: YAHOO,
        availableOnly: true,
      } as WhosHotSettings;
      await renderSettled();

      expect(ngMocks.input(table(), 'availableFilter')).toBe(false);
      expect(rosteredPlayerIds).not.toHaveBeenCalled();
    });

    it('asks nothing of the league while the switch is off', async () => {
      stored = { fromGame: 1, toGame: 82, yahooSync: YAHOO } as WhosHotSettings;
      await renderSettled();

      expect(ngMocks.input(table(), 'availableFilter')).toBe(true);
      expect(rosteredPlayerIds).not.toHaveBeenCalled();
      expect(ngMocks.input(table(), 'rosteredPlayerIds')).toBeNull();
    });

    it("hands the table a Yahoo league's rostered players once the switch is on", async () => {
      rosteredPlayerIds.mockImplementation(() => of(new Set([6743, 7109])));
      stored = {
        fromGame: 1,
        toGame: 82,
        yahooSync: YAHOO,
        availableOnly: true,
      } as WhosHotSettings;
      await renderSettled();

      expect(rosteredPlayerIds).toHaveBeenCalledWith({ platform: 'YAHOO', leagueId: '465.l.9' });
      expect(ngMocks.input(table(), 'rosteredPlayerIds')).toEqual(new Set([6743, 7109]));
    });

    it('asks an ESPN league by its id', async () => {
      stored = { fromGame: 1, toGame: 82, espnSync: ESPN, availableOnly: true } as WhosHotSettings;
      await renderSettled();

      expect(rosteredPlayerIds).toHaveBeenCalledWith({ platform: 'ESPN', leagueId: '123' });
    });

    it('remembers the switch between visits', async () => {
      stored = { fromGame: 1, toGame: 82, yahooSync: YAHOO } as WhosHotSettings;
      const fixture = await renderSettled();

      fixture.point.componentInstance.availableOnly.set(true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ availableOnly: true }));
    });
  });
});
