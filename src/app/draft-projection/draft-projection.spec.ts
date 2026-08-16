import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection';
import { PlayerProjectionsTableComponent } from './player-projections-table/player-projections-table';
import { PlayerService } from '../services/player.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { ProjectionSyncService } from '../services/projection-sync.service';
import { Goalie, Skater } from '../models/player.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { Projection } from '../models/projection.model';

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

  beforeEach(() =>
    MockBuilder(DraftProjectionComponent)
      .mock(PlayerService, {
        getPlayers: () => of([...mockSkaters, ...mockGoalies]),
      })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(mockProjection),
        updateProjection: () => of(mockProjection),
      })
      .keep(ProjectionSyncService)
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

  it('shows a Draft mode link in the header', async () => {
    const fixture = MockRender(DraftProjectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.draft-mode-link');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Draft mode');
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
    expect(fixture.nativeElement.querySelector('.synced-mark--yahoo')).toBeNull();
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
    expect(fixture.nativeElement.querySelector('.synced-mark--yahoo')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.synced-mark--espn')).toBeNull();
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
      component.applyFullSeason({ scaleStats: true, minGamesToScale: 20 });

      expect(applySpy).toHaveBeenCalledWith(true, 20);
      expect(component.showFullSeasonDialog()).toEqual(false);
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
      const updateSpy = vi.spyOn(
        ngMocks.findInstance(ProjectionStorageService),
        'updateProjection',
      );
      const fixture = MockRender(DraftProjectionComponent);
      await fixture.whenStable();

      // Without the guard this is exactly the sequence that emptied a real projection: a change
      // to a setting, and an autosave that carries the table's (absent) rows with it.
      fixture.point.componentInstance.leagueSize.set(14);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(updateSpy).not.toHaveBeenCalled();
    }, 10000);
  });
});
