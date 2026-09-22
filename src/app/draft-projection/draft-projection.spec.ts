import { MockBuilder, MockedComponentFixture, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { AUTOSAVE_DEBOUNCE_MS, DraftProjectionComponent } from './draft-projection';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { PlayerService } from '../services/player.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { ProjectionSyncService } from '../services/projection-sync.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { ShareLinkResponse } from '../api/models/share-link-response';
import { LeagueImportButtonComponent } from '../shared/league-import-button/league-import-button';
import { Goalie, Skater } from '../models/player.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { Projection } from '../models/projection.model';
import { renameOnOpenExtras } from './rename-intent';

describe('DraftProjectionComponent', () => {
  const mockSkaters: Skater[] = [
    {
      id: 1,
      type: 'skater',
      name: 'Connor McDavid',
      positions: new Set(['C']),
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: {
          stpg: 0,
          stpa: 0,
          stp: 0,
          hatTricks: 0,
          defPoints: 0,
          shifts: 0,
          toi: 0,
          goals: 64,
          assists: 89,
          points: 153,
          plusMinus: 33,
          pim: 36,
          ppg: 22,
          ppa: 38,
          ppp: 60,
          shg: 1,
          sha: 0,
          shp: 1,
          gwg: 8,
          sog: 348,
          shPct: 18.4,
          fw: 812,
          fl: 623,
          hits: 42,
          blocks: 28,
        },
      },
    },
  ];
  const mockGoalies: Goalie[] = [];

  const mockProjection: ProjectionResponse = {
    id: 'p1',
    kind: 'projection',
    name: 'My league',
    season: '20262027',
    autoNamed: false,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: {
      settings: {
        scoringType: 'category',
        statWeights: { goals: 5 },
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0 },
        useDefaultDecimals: false,
      },
      players: [
        {
          playerId: 1,
          type: 'skater',
          stats: {
            utility: { gp: 82 },
            scoring: {
              stpg: 0,
              stpa: 0,
              stp: 0,
              hatTricks: 0,
              defPoints: 0,
              shifts: 0,
              toi: 0,
              goals: 64,
            },
          },
        },
      ],
    },
  };

  /**
   * The page reads the navigation's state for the "open ready to be renamed" intent, and spends
   * it through Location so a reload cannot pick it up again. Both are stubbed rather than real:
   * the real Location cannot be built on ng-mocks' LocationStrategy.
   */
  const replaceState = vi.fn();
  const currentNavigation = vi.fn(() => null as { extras: { state?: unknown } } | null);
  const locationStub = { path: () => '/projections/p1', replaceState };
  const routerStub = { navigate: vi.fn(), url: '/projections/p1', currentNavigation };

  // Most projections have no link, which the share check answers with a 404.
  const notSharedYet = {
    getShare: () => throwError(() => new HttpErrorResponse({ status: 404 })),
    share: () => of({ shareUrl: 'https://slapstat.test/s/abc' } as ShareLinkResponse),
    rowsToPublish: () => [],
  };

  beforeEach(() => {
    replaceState.mockClear();
    routerStub.navigate.mockClear();
    currentNavigation.mockReturnValue(null);
  });

  beforeEach(() =>
    MockBuilder(DraftProjectionComponent)
      .mock(PlayerService, {
        getPlayers: () => of([...mockSkaters, ...mockGoalies]),
      })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(mockProjection),
        updateProjection: () => of(mockProjection),
      })
      .mock(ProjectionShareService, notSharedYet)
      .keep(ProjectionSyncService)
      // Real, so the toolbar says which league the projection is synced with.
      .keep(LeagueImportButtonComponent)
      .provide({ provide: Location, useValue: locationStub })
      .provide({ provide: Router, useValue: routerStub })
      .provide({
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
      }),
  );

  it('loads the projection named in the route into edit mode', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.projectionName()).toEqual('My league');
    expect(component.players()).toEqual([...mockSkaters, ...mockGoalies]);
  });

  it('includes the off-season player-data notice', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-offseason-data-notice')).not.toBeNull();
  });

  it('shows a Draft Mode link in the header', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.draft-mode-link');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Draft Mode');
  });

  it('applies the loaded projection settings', () => {
    const component = MockRender(DraftProjectionComponent).point.componentInstance;

    expect(component.scoringType()).toEqual('category');
    expect(component.activeScoringColumns().has('goals')).toEqual(true);
    expect(component.loadedProjections()?.length).toEqual(1);
  });

  it('renames the projection and persists the new name', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.startRename();
    component.renameValue.set('Renamed league');
    component.saveRename();
    await fixture.whenStable();

    expect(updateSpy).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Renamed league' }),
    );
    expect(component.projectionName()).toEqual('Renamed league');
    expect(component.isRenaming()).toEqual(false);
  });

  // The player rows are ~0.5 MB and a rename does not touch them, so the server keeps the
  // stored ones. Re-uploading them is what made saving fail outright on a slow connection.
  it('leaves the player rows out of a save that did not change them', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.startRename();
    component.renameValue.set('Renamed league');
    component.saveRename();
    await fixture.whenStable();

    expect(updateSpy.mock.calls[0][1].data.players).toBeUndefined();
    expect(updateSpy.mock.calls[0][1].data.settings).toBeDefined();
  });

  it('sends the player rows when they have changed', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.loadedProjections.set([
      {
        type: 'skater',
        playerId: 1,
        stats: {
          utility: { gp: 70, toiPerGame: 1200 },
          scoring: {
            stpg: 0,
            stpa: 0,
            stp: 0,
            hatTricks: 0,
            defPoints: 0,
            shifts: 0,
            toi: 0,
            goals: 99,
          },
        },
      } as Projection,
    ]);
    component.startRename();
    component.renameValue.set('Renamed league');
    component.saveRename();
    await fixture.whenStable();

    expect(updateSpy.mock.calls[0][1].data.players).toHaveLength(1);
  });

  /**
   * The debounced autosave had no cover at all, which is what let the guard test below sit
   * green while asserting on a service instance the component never touched. This is the
   * control for it: the same edit, a pool that loaded, and a save that does happen.
   */
  it('saves a settings edit once the debounce has run out', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.leagueSize.set(14);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 200));

    expect(updateSpy).toHaveBeenCalled();
    expect(component.saveStatus()).toEqual('saved');
  }, 10000);

  describe('sharing', () => {
    /**
     * The edited rows live in the table. The share read the rows the projection was opened
     * with instead, so every stat edited after opening was missing from the link.
     */
    it('publishes the rows the table holds, not the ones the projection was opened with', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const component = fixture.point.componentInstance;
      const edited = [
        {
          type: 'skater',
          playerId: 1,
          stats: { utility: { gp: 82, toiPerGame: 1320 }, scoring: { goals: 70 } },
        } as Projection,
      ];
      Object.defineProperty(
        ngMocks.findInstance(PlayerProjectionsTableComponent),
        'playerProjections',
        {
          value: signal(edited),
        },
      );
      const rowsSpy = vi.spyOn(ngMocks.findInstance(ProjectionShareService), 'rowsToPublish');

      component.sharedPlayers();

      expect(rowsSpy.mock.calls[0][0].playerProjections).toBe(edited);
    });

    it('publishes the board again after a save when the projection has a link', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      const shares = ngMocks.findInstance(ProjectionShareService);
      vi.spyOn(shares, 'getShare').mockReturnValue(
        of({ shareUrl: 'https://slapstat.test/s/abc' } as ShareLinkResponse),
      );
      const shareSpy = vi.spyOn(shares, 'share');
      const rowsSpy = vi.spyOn(shares, 'rowsToPublish');

      component.leagueSize.set(14);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 200));

      expect(shareSpy).toHaveBeenCalledWith('p1', []);
      // Ranked under the league as saved, not the one the projection was opened with.
      expect(rowsSpy.mock.calls.at(-1)?.[0].leagueSize).toEqual(14);
      expect(component.saveStatus()).toEqual('saved');
    }, 10000);

    it('publishes nothing for a projection that has no link', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      const shareSpy = vi.spyOn(ngMocks.findInstance(ProjectionShareService), 'share');

      component.startRename();
      component.renameValue.set('Renamed league');
      component.saveRename();
      await fixture.whenStable();

      expect(shareSpy).not.toHaveBeenCalled();
      expect(component.saveStatus()).not.toEqual('error');
    });

    it('keeps the link in step from the first share on, without asking the server again', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      const shares = ngMocks.findInstance(ProjectionShareService);
      const getShareSpy = vi.spyOn(shares, 'getShare');
      const shareSpy = vi.spyOn(shares, 'share');

      component.onShared();
      component.startRename();
      component.renameValue.set('Renamed league');
      component.saveRename();
      await fixture.whenStable();

      expect(getShareSpy).not.toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith('p1', []);
    });

    it('says the save failed when the link could not be brought up to date', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      vi.spyOn(ngMocks.findInstance(ProjectionShareService), 'share').mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 502 })),
      );

      component.onShared();
      component.leagueSize.set(14);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 200));

      expect(component.saveStatus()).toEqual('error');
    }, 10000);
  });

  /**
   * The corrections are small and the server replaces what it is sent, so a save that skips the
   * player rows still has to carry them. Leaving them out of this payload is how they would be
   * lost to the next rename.
   */
  it('carries the corrected positions on a save that leaves the player rows out', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.onPositionsChanged({ playerId: 1, positions: ['LW', 'RW'] });
    component.startRename();
    component.renameValue.set('Renamed league');
    component.saveRename();
    await fixture.whenStable();

    expect(updateSpy.mock.calls[0][1].data.players).toBeUndefined();
    expect(updateSpy.mock.calls[0][1].data.positionOverrides).toEqual([
      { playerId: 1, positions: ['LW', 'RW'] },
    ]);
  });

  it('sends an empty list when the owner resets every position, so the server clears them', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.onPositionsChanged({ playerId: 1, positions: ['D'] });
    component.onPositionsReset();
    component.startRename();
    component.renameValue.set('Renamed league');
    component.saveRename();
    await fixture.whenStable();

    expect(updateSpy.mock.calls[0][1].data.positionOverrides).toEqual([]);
  });

  it('shows the corrected positions on the player, not the ones the pool reports', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.onPositionsChanged({ playerId: 1, positions: ['D'] });
    fixture.detectChanges();

    const corrected = component.players().find((player) => player.id === 1);
    expect(corrected?.type === 'skater' && [...corrected.positions]).toEqual(['D']);
  });

  it('reports a conflict and keeps the old name when the name is taken', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection').mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    component.startRename();
    component.renameValue.set('Taken name');
    component.saveRename();
    await fixture.whenStable();

    expect(component.renameError()).toContain('already exists');
    expect(component.projectionName()).toEqual('My league');
    expect(component.isRenaming()).toEqual(true);
  });

  it('rejects an empty name without calling the API', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.startRename();
    component.renameValue.set('   ');
    component.saveRename();

    expect(component.renameError()).toContain('empty');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('warns when a synced setting changes and clears the sync on confirm', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applyYahooSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        statWeights: { goals: 5 },
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        leagueSize: 12,
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueName: 'HHL',
      leagueKey: 'nhl.l.1',
    });
    expect(component.diverged()).toEqual(false);

    component.leagueSize.set(20);
    expect(component.diverged()).toEqual(true);

    component.confirmUnsync();
    expect(component.yahooSync()).toBeNull();
    expect(component.diverged()).toEqual(false);
  });

  it('names the ESPN league it synced from, and stops naming the Yahoo one', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const settings = {
      scoringType: 'category' as const,
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      statWeights: { goals: 5 },
      rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
      leagueSize: 12,
      unsupportedStats: [],
      unsupportedRosterCodes: [],
    };

    component.applyYahooSettings({ settings, leagueName: 'HHL', leagueKey: 'nhl.l.1' });
    expect(component.syncedLeagueName()).toEqual('HHL');

    component.applyEspnSettings({
      settings: { ...settings, leagueName: 'Puck Luck Dynasty' },
      leagueId: '123456',
      leagueName: 'Puck Luck Dynasty',
    });

    expect(component.syncedLeagueName()).toEqual('Puck Luck Dynasty');
    // These settings are ESPN's now — a leftover Yahoo stamp would mislabel them.
    expect(component.yahooSync()).toBeNull();
    expect(component.espnSync()?.leagueId).toEqual('123456');
  });

  it('turns the import action into a report of which league is synced', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(fixture.nativeElement.textContent).toContain('Import league');

    component.applyEspnSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueId: '123456',
      leagueName: 'Puck Luck Dynasty',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Synced with Puck Luck Dynasty');
    // Same slot, same dialog behind it — the import is still one click away.
    expect(fixture.nativeElement.textContent).not.toContain('Import league');
    expect(fixture.nativeElement.querySelector('.synced-league .synced-dot')).toBeTruthy();
    // The platform's mark says where the league lives, without spending width on its name.
    expect(fixture.nativeElement.querySelector('.synced-mark--espn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-yahoo-mark')).toBeNull();
  });

  it('wears the Yahoo mark for a league synced from Yahoo', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applyYahooSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueName: 'HHL',
      leagueKey: 'nhl.l.1',
    });
    fixture.detectChanges();

    expect(component.syncedProvider()).toEqual('yahoo');
    expect(fixture.nativeElement.querySelector('app-yahoo-mark')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.synced-mark--espn')).toBeNull();
  });

  it('warns when a setting drifts from the ESPN league, and lets the user own it', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applyEspnSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        statWeights: { goals: 5 },
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        leagueSize: 12,
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueId: '123456',
      leagueName: 'Puck Luck Dynasty',
    });
    expect(component.diverged()).toEqual(false);

    component.scoringType.set('points');
    expect(component.diverged()).toEqual(true);

    // "Ok, I understand": the projection is its own from here, and the toolbar stops claiming
    // a league.
    component.confirmUnsync();
    expect(component.diverged()).toEqual(false);
    expect(component.espnSync()).toBeNull();
    expect(component.syncedLeagueName()).toBeNull();
  });

  it('keeps the league to import from after the projection is taken out of sync', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applyEspnSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueId: '1052312029',
      leagueName: 'My 2027 League',
    });

    component.confirmUnsync();

    // The claim is gone — the toolbar asks to import again...
    expect(component.espnSync()).toBeNull();
    expect(component.syncedLeagueName()).toBeNull();
    // ...but the id is not something the user can look up from in here, so the form keeps it.
    expect(component.lastEspnLeagueId()).toEqual('1052312029');
  });

  it('closes the import dialog once a sync lands with nothing to report', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.showSyncDialog.set(true);

    component.applyEspnSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueId: '123456',
      leagueName: 'Puck Luck Dynasty',
    });

    expect(component.showSyncDialog()).toEqual(false);
  });

  it('keeps the dialog open when the league scores something we cannot map', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.showSyncDialog.set(true);

    component.applyEspnSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedStats: ['Defensive Points'],
        unsupportedRosterCodes: [],
      },
      leagueId: '123456',
      leagueName: 'Puck Luck Dynasty',
    });

    // That list is the only place this is said, so closing over it would swallow it.
    expect(component.showSyncDialog()).toEqual(true);
  });

  it('falls back to the id when ESPN returns a league with no name', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applyEspnSettings({
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedStats: [],
        unsupportedRosterCodes: [],
      },
      leagueId: '123456',
    });

    expect(component.syncedLeagueName()).toEqual('123456');
  });

  describe('full-season bulk action', () => {
    it('opens and cancels the confirmation dialog', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      expect(component.showFullSeasonDialog()).toEqual(false);
      component.openFullSeasonDialog();
      expect(component.showFullSeasonDialog()).toEqual(true);
      component.cancelFullSeason();
      expect(component.showFullSeasonDialog()).toEqual(false);
    });

    it('applies the full season to the table and closes the dialog on confirm', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const component = fixture.point.componentInstance;
      const table = ngMocks.findInstance(PlayerProjectionsTableComponent);
      const applySpy = vi.spyOn(table, 'applyFullSeasonGames');

      component.openFullSeasonDialog();
      component.applyFullSeason({ scaleStats: true, minGamesToScale: 20, scaleGoalies: false });

      expect(applySpy).toHaveBeenCalledWith(true, 20, false);
      expect(component.showFullSeasonDialog()).toEqual(false);
    });

    it("passes the dialog's goalie choice through to the table", async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const component = fixture.point.componentInstance;
      const table = ngMocks.findInstance(PlayerProjectionsTableComponent);
      const applySpy = vi.spyOn(table, 'applyFullSeasonGames');

      component.applyFullSeason({ scaleStats: true, minGamesToScale: 20, scaleGoalies: true });

      expect(applySpy).toHaveBeenCalledWith(true, 20, true);
    });

    it('renders the confirmation dialog only while it is open', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-full-season-dialog')).toBeNull();

      fixture.point.componentInstance.openFullSeasonDialog();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-full-season-dialog')).not.toBeNull();
    });
  });

  /**
   * A 200 carrying an empty list is not an error, so it walks past the error effect and leaves the
   * resource holding its `defaultValue`. Rendering the editor on that made a loaded projection look
   * like an empty one, and autosaving the result is how a real one was destroyed.
   */
  describe('when the player pool comes back empty', () => {
    beforeEach(() =>
      MockBuilder(DraftProjectionComponent)
        .mock(PlayerService, { getPlayers: () => of([]) })
        .mock(ProjectionStorageService, {
          loadProjection: () => of(mockProjection),
          updateProjection: () => of(mockProjection),
        })
        .keep(ProjectionSyncService)
        .provide({ provide: Location, useValue: locationStub })
        .provide({ provide: Router, useValue: routerStub })
        .provide({
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
        }),
    );

    it('shows the error state instead of the table', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-player-projections-table')).toBeNull();
    });

    it('never writes the projection back, even after an edit that would normally autosave', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      // Spied after the render and not before it: a TestBed lookup ahead of MockRender takes the
      // service out of a module ng-mocks then rebuilds — "Forgot to flush TestBed?" is the
      // warning it prints — so the spy sat on an instance the component never called, and this
      // assertion held whether the guard was there or not. Deleting the guard now fails it.
      const updateSpy = vi.spyOn(
        ngMocks.findInstance(ProjectionStorageService),
        'updateProjection',
      );

      // Without the guard this is exactly the sequence that emptied a real projection: a change
      // to a setting, and an autosave that carries the table's (absent) rows with it.
      component.leagueSize.set(14);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 200));

      expect(updateSpy).not.toHaveBeenCalled();
      expect(component.saveStatus()).toEqual('idle');
    }, 10000);
  });

  /**
   * The acknowledgement is the one edit whose next move is almost always to leave the page, and
   * the debounce it used to wait for is cancelled when the page goes. Dismissing the notice and
   * navigating away brought it straight back on the next open.
   */
  it('saves the acknowledgement before the page can be left', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.unacknowledgedNewPlayerIds.set([1]);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 300));
    expect(updateSpy.mock.calls.at(-1)![1].data.settings.unacknowledgedNewPlayerIds).toEqual([1]);

    component.acknowledgeNewPlayers();
    fixture.destroy();

    expect(
      updateSpy.mock.calls.at(-1)![1].data.settings.unacknowledgedNewPlayerIds,
    ).toBeUndefined();
  }, 10000);

  /** The save it makes is one save: the debounce that follows must not send the same board again. */
  it('leaves the debounced save nothing to do once the new players are acknowledged', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.unacknowledgedNewPlayerIds.set([1]);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 300));
    const savesBefore = updateSpy.mock.calls.length;

    component.acknowledgeNewPlayers();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 300));

    expect(updateSpy.mock.calls.length).toEqual(savesBefore + 1);
  }, 10000);

  /**
   * The debounce cannot survive the page being left, and the last edit before leaving is the
   * likeliest one there is: a stat typed, a column ticked, a setting changed, and then away.
   */
  it('sends the last edit when the page is left inside the debounce', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.leagueSize.set(14);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.destroy();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][1].data.settings.leagueSize).toEqual(14);
  }, 10000);

  /** The state on the way out is the one the debounce was armed with, not one saved over since. */
  it('does not put an older state back over an acknowledgement saved on its own', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.unacknowledgedNewPlayerIds.set([1]);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS + 300));
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    component.acknowledgeNewPlayers();
    fixture.destroy();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(
      updateSpy.mock.calls.at(-1)![1].data.settings.unacknowledgedNewPlayerIds,
    ).toBeUndefined();
  }, 10000);

  /** Nothing to save is nothing to send: leaving a page that was only read must not write. */
  it('writes nothing on the way out when nothing changed', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    const updateSpy = vi.spyOn(ngMocks.findInstance(ProjectionStorageService), 'updateProjection');

    fixture.destroy();

    expect(updateSpy).not.toHaveBeenCalled();
  }, 10000);

  /**
   * A copy is named by the server after the share it came from ("Copy of Alex's league"), which
   * names the projection it was taken from rather than the one the user is about to build. The
   * two places that take a copy therefore ask for the editor to open with the rename waiting.
   */
  describe('opening ready to be renamed', () => {
    it('starts the rename on the server-given name, selected, when the navigation asked for it', async () => {
      currentNavigation.mockReturnValue({ extras: { state: { renameOnOpen: true } } });
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const component = fixture.point.componentInstance;

      expect(component.isRenaming()).toEqual(true);
      expect(component.renameValue()).toEqual('My league');
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.rename-input');
      expect(input.selectionStart).toEqual(0);
      expect(input.selectionEnd).toEqual('My league'.length);
    });

    /** Escape leaves the name the server chose in place rather than an empty or half-typed one. */
    it('keeps the server-given name when the rename is cancelled', async () => {
      currentNavigation.mockReturnValue({ extras: { state: { renameOnOpen: true } } });
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;

      component.renameValue.set('');
      component.cancelRename();

      expect(component.isRenaming()).toEqual(false);
      expect(component.projectionName()).toEqual('My league');
    });

    /**
     * Navigation state is restored with the history entry, so without spending it the rename
     * would reopen on every reload of the copy's URL.
     */
    it('spends the intent so a reload does not reopen the rename', async () => {
      currentNavigation.mockReturnValue({ extras: { state: { renameOnOpen: true } } });
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();

      expect(replaceState).toHaveBeenCalledWith('/projections/p1', '', {});
    });

    it('leaves the rename closed when nothing asked for it', async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();

      expect(fixture.point.componentInstance.isRenaming()).toEqual(false);
      expect(replaceState).not.toHaveBeenCalled();
    });
  });

  /**
   * A followed projection is a mirror of somebody else's: the server rewrites it whenever they
   * share it again and keeps nothing this page could send but the draft. So the page offers no
   * control that would change it, and offers a copy instead.
   */
  describe('a followed projection', () => {
    const followed: ProjectionResponse = {
      ...mockProjection,
      kind: 'imported',
      name: "Alex's league",
      origin: { authorUsername: 'alex', shareToken: 'tok123' },
    };

    const copyFromShare = vi.fn();

    beforeEach(() => {
      copyFromShare.mockClear();
      copyFromShare.mockReturnValue(
        of({ ...mockProjection, id: 'copy9', name: "Copy of Alex's league" }),
      );
      return MockBuilder(DraftProjectionComponent)
        .mock(PlayerService, { getPlayers: () => of([...mockSkaters, ...mockGoalies]) })
        .mock(ProjectionStorageService, {
          loadProjection: () => of(followed),
          updateProjection: () => of(followed),
          copyFromShare,
        })
        .mock(ProjectionShareService, notSharedYet)
        .keep(ProjectionSyncService)
        .provide({ provide: Location, useValue: locationStub })
        .provide({ provide: Router, useValue: routerStub })
        .provide({
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
        });
    });

    const renderFollowed = async () => {
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      followFixtures.push(fixture);
      return fixture;
    };
    const followFixtures: MockedComponentFixture<DraftProjectionComponent>[] = [];
    afterEach(() => {
      // Destroyed here rather than left to the TestBed reset: the editor's autosave pipeline is
      // held by the component, and a fixture still alive when the injector goes reaches for it
      // afterwards. Vitest counts that as an unhandled error and fails the run.
      followFixtures.splice(0).forEach((fixture) => fixture.destroy());
    });

    it('offers no rename and no Share, and says whose projection it is', async () => {
      const fixture = await renderFollowed();

      expect(fixture.point.componentInstance.isFollow()).toEqual(true);
      expect(fixture.nativeElement.querySelector('.rename-trigger')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Share');
      expect(
        fixture.nativeElement.querySelector('[data-testid="follow-note"]').textContent,
      ).toContain('alex');
    });

    /** Drafting against a follow is the point of having one, so that link stays. */
    it('still offers Draft Mode', async () => {
      const fixture = await renderFollowed();

      expect(fixture.nativeElement.querySelector('.draft-mode-link')).not.toBeNull();
    });

    it('renders the table as something to read, with no settings or column controls', async () => {
      await renderFollowed();
      const table = ngMocks.findInstance(PlayerProjectionsTableComponent);

      expect(table.readOnly()).toEqual(true);
      expect(table.columnControls()).toEqual(false);
      expect(table.positionControls()).toEqual(false);
      expect(table.rankingControls()).toEqual(false);
    });

    /** Nothing here can change it, and the server would keep only the draft out of a save anyway. */
    it('never writes it back', async () => {
      const fixture = await renderFollowed();
      const updateSpy = vi.spyOn(
        ngMocks.findInstance(ProjectionStorageService),
        'updateProjection',
      );

      fixture.point.componentInstance.unacknowledgedNewPlayerIds.set([]);
      fixture.destroy();

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('copies from the share token and opens the copy ready to be renamed', async () => {
      const fixture = await renderFollowed();

      fixture.nativeElement.querySelector('[data-testid="copy-follow"]').click();
      await fixture.whenStable();

      expect(copyFromShare).toHaveBeenCalledWith('tok123');
      expect(routerStub.navigate).toHaveBeenCalledWith(
        ['/projections', 'copy9'],
        renameOnOpenExtras,
      );
    });
  });
});
