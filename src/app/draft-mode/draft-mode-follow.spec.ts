import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { DraftModeComponent } from './draft-mode';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionCalculationService } from '../services/projection-calculation.service';
import { PositionFilterService } from '../services/position-filter.service';
import { FeatureService } from '../services/feature.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { Player } from '../models/player.model';
import { SkaterStats } from '../models/projection.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';
import { DraftState } from '../api/models/draft-state';
import { LeagueDraftResponse } from '../api/models/league-draft-response';
import { boardFromLeagueDraft } from './league-draft-follow';

describe('DraftModeComponent following a Yahoo draft', () => {
  const players: Player[] = [
    {
      id: 6743,
      type: 'skater',
      name: 'McDavid',
      positions: new Set(['C']),
      stats: {} as SkaterStats,
    },
    {
      id: 7109,
      type: 'skater',
      name: 'Makar',
      positions: new Set(['D']),
      stats: {} as SkaterStats,
    },
  ];

  const handEnteredDraft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
    settings: {
      scoringType: 'points',
      statWeights: { goals: 1 },
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
      yahooSync: {
        leagueName: 'Beer League',
        leagueKey: '465.l.9',
        syncedAt: '2026-09-01T00:00:00Z',
      },
    },
  };

  const projectionWith = (draft: DraftState): ProjectionResponse => ({
    id: 'p1',
    kind: 'draft',
    name: 'My Projection',
    season: '20262027',
    autoNamed: false,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    data: {
      settings: {
        scoringType: 'points',
        statWeights: { goals: 1 },
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0 },
        useDefaultDecimals: false,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
      },
      players: [],
      draft,
    },
  });

  const leagueDraft = (
    picks: LeagueDraftResponse['picks'] = [],
    orderKnown = true,
  ): LeagueDraftResponse => ({
    status: 'IN_PROGRESS',
    auction: false,
    teams: [
      { id: '465.l.9.t.2', name: 'Bravo', mine: false },
      { id: '465.l.9.t.1', name: 'Alpha', mine: true },
    ],
    orderKnown,
    picks,
  });

  const updateProjection =
    vi.fn<(id: string, request: UpdateProjectionRequest) => Observable<ProjectionResponse>>();
  const leagueDraftCall = vi.fn<(leagueKey: string) => Observable<LeagueDraftResponse>>();
  const leagueDraftSync = signal(true);
  const returnedTo = vi.fn<(url: string) => boolean>();
  const renameProjection = vi.fn();
  let loaded: ProjectionResponse;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateProjection.mockReset();
    leagueDraftCall.mockReset();
    returnedTo.mockReset();
    returnedTo.mockReturnValue(false);
    renameProjection.mockReset();
    renameProjection.mockImplementation((id: string, name: string) => of({ id, name }));
    leagueDraftSync.set(true);
    loaded = projectionWith(handEnteredDraft);
    updateProjection.mockImplementation(() => of(loaded));
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(loaded),
        updateProjection,
        renameProjection,
      })
      .mock(FeatureService, { leagueDraftSync })
      .mock(YahooService, { leagueDraft: leagueDraftCall })
      .mock(YahooConnectReturnService, { returnedTo })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'p1' : null) } },
        },
      });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderFixture = async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    return fixture;
  };

  const render = async () => (await renderFixture()).point.componentInstance;

  const savedDraft = () => updateProjection.mock.lastCall?.[1].data?.draft;

  const statusText = (fixture: Awaited<ReturnType<typeof renderFixture>>) => {
    fixture.detectChanges();
    return (
      (fixture.nativeElement as HTMLElement).querySelector('.follow-status')?.textContent ?? ''
    );
  };

  it('is offered only where the feature is on and the draft has a Yahoo league', async () => {
    expect((await render()).canFollow()).toBe(true);

    leagueDraftSync.set(false);
    expect((await render()).canFollow()).toBe(false);

    leagueDraftSync.set(true);
    loaded = projectionWith({
      ...handEnteredDraft,
      settings: { ...handEnteredDraft.settings!, yahooSync: undefined },
    });
    expect((await render()).canFollow()).toBe(false);
  });

  const progressText = (fixture: Awaited<ReturnType<typeof renderFixture>>) => {
    fixture.detectChanges();
    return (
      (fixture.nativeElement as HTMLElement)
        .querySelector('.draft-progress')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    );
  };

  it('says your first pick while it waits, where the league has set its order', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.requestFollow();

    expect(component.awaitingLeagueDraft()).toBe(true);
    expect(component.order()).toEqual(['465.l.9.t.2', '465.l.9.t.1']);
    expect(progressText(fixture)).toEqual(
      'Waiting for the Yahoo draft to start · your first pick is #2',
    );

    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.awaitingLeagueDraft()).toBe(false);
    expect(component.upNextTeam()?.name).toEqual('Alpha');
    component.stopFollowing();
  });

  // Before a live draft runs, Yahoo lists the league's teams in an order of its own. A seat read
  // off that list is a guess nobody can tell from the real one: it said #6 to a manager whose
  // league had him picking twelfth.
  it("names no seat while the league's order is not known, and takes it with the first pick", async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft([], false)));
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.requestFollow();

    expect(component.following()).toBe(true);
    expect(component.awaitingLeagueDraft()).toBe(true);
    expect(component.leagueFirstPick()).toBeNull();
    expect(progressText(fixture)).toEqual('Waiting for the Yahoo draft to start');
    // The board keeps its own teams and order rather than saving Yahoo's list as the draft's.
    expect(component.order()).toEqual(['team-me', 'team-1']);
    expect(savedDraft()?.order).toEqual(['team-me', 'team-1']);

    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.order()).toEqual(['465.l.9.t.2', '465.l.9.t.1']);
    expect(component.picks()).toEqual([{ playerId: 6743, teamId: '465.l.9.t.2' }]);
    expect(savedDraft()?.order).toEqual(['465.l.9.t.2', '465.l.9.t.1']);
    expect(progressText(fixture)).toContain('Up next: Alpha');
    component.stopFollowing();
  });

  it('takes the order once the league sets it, before any pick is made', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft([], false)));
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    component.requestFollow();
    expect(progressText(fixture)).toEqual('Waiting for the Yahoo draft to start');

    leagueDraftCall.mockReturnValue(of(leagueDraft([], true)));
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.order()).toEqual(['465.l.9.t.2', '465.l.9.t.1']);
    expect(progressText(fixture)).toEqual(
      'Waiting for the Yahoo draft to start · your first pick is #2',
    );
    component.stopFollowing();
  });

  it("takes the league's teams and picks, saves them, and locks pick edits", async () => {
    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    const component = await render();

    component.requestFollow();

    expect(leagueDraftCall).toHaveBeenCalledWith('465.l.9');
    expect(component.following()).toBe(true);
    expect(component.order()).toEqual(['465.l.9.t.2', '465.l.9.t.1']);
    expect(component.picks()).toEqual([{ playerId: 6743, teamId: '465.l.9.t.2' }]);
    expect(updateProjection).toHaveBeenCalledTimes(1);
    expect(updateProjection.mock.calls[0][1].data.draft?.settings?.yahooSync?.leagueKey).toBe(
      '465.l.9',
    );

    component.draftCurrent(7109);
    component.undoLast();
    expect(component.picks()).toHaveLength(1);
    expect(component.canUndo()).toBe(false);
  });

  it('picks up a new pick on the next poll and saves only when something changed', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();
    expect(updateProjection).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(updateProjection).toHaveBeenCalledTimes(1);

    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.picks()).toEqual([{ playerId: 6743, teamId: '465.l.9.t.2' }]);
    expect(updateProjection).toHaveBeenCalledTimes(2);

    component.stopFollowing();
    await vi.advanceTimersByTimeAsync(5000);
    expect(leagueDraftCall).toHaveBeenCalledTimes(3);
    expect(component.following()).toBe(false);
  });

  it('is one switch: on asks Yahoo for the draft, off stops', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();

    component.toggleFollow();
    expect(leagueDraftCall).toHaveBeenCalledTimes(1);
    expect(component.following()).toBe(true);

    component.toggleFollow();
    expect(component.following()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(leagueDraftCall).toHaveBeenCalledTimes(1);
  });

  it('says where the picks come from and how far the draft has got', async () => {
    leagueDraftCall.mockReturnValue(
      of(leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }])),
    );
    const fixture = await renderFixture();
    expect(statusText(fixture)).toEqual('');

    fixture.point.componentInstance.requestFollow();

    // Two teams with seven slots each: the count is the board's, the name is the league's.
    expect(statusText(fixture).replace(/\s+/g, ' ')).toContain(
      'Live from Beer League on Yahoo · 1 of 14 picks',
    );
  });

  it('asks before replacing picks entered by hand', async () => {
    loaded = projectionWith({
      ...handEnteredDraft,
      picks: [{ playerId: 7109, teamId: 'team-me' }],
    });
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();

    component.requestFollow();
    expect(component.pendingFollow()).not.toBeNull();
    expect(component.following()).toBe(false);
    component.cancelFollow();
    expect(component.picks()).toHaveLength(1);

    component.requestFollow();
    component.confirmFollow();
    expect(component.following()).toBe(true);
    expect(component.picks()).toEqual([]);
  });

  it("asks before replacing a pick entered by hand on a board that has the league's teams", async () => {
    const leagueBoard = boardFromLeagueDraft(handEnteredDraft, leagueDraft());
    loaded = projectionWith({ ...leagueBoard, picks: [{ playerId: 7109, teamId: '465.l.9.t.2' }] });
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.requestFollow();
    expect(component.following()).toBe(false);
    expect(component.pendingFollowKeepsTeams()).toBe(true);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.modal-text')?.textContent,
    ).toContain('Your 1 picks here are replaced by the 0 picks made on Yahoo.');
    component.cancelFollow();
    expect(component.picks()).toEqual([{ playerId: 7109, teamId: '465.l.9.t.2' }]);
  });

  it("follows without asking when every pick on the board is the league's", async () => {
    const madePicks = [
      { overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 },
      { overall: 2, round: 1, teamId: '465.l.9.t.1', playerId: 7109 },
    ];
    loaded = projectionWith(
      boardFromLeagueDraft(handEnteredDraft, leagueDraft(madePicks.slice(0, 1))),
    );
    leagueDraftCall.mockReturnValue(of(leagueDraft(madePicks)));
    const component = await render();

    component.requestFollow();
    expect(component.pendingFollow()).toBeNull();
    expect(component.following()).toBe(true);
    expect(component.picks()).toHaveLength(2);
    component.stopFollowing();
  });

  it('asks Yahoo at once when the tab comes back into view, and not while it is hidden', async () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      leagueDraftCall.mockReturnValue(of(leagueDraft()));
      const component = await render();
      component.requestFollow();
      expect(leagueDraftCall).toHaveBeenCalledTimes(1);

      hidden = true;
      await vi.advanceTimersByTimeAsync(15000);
      expect(leagueDraftCall).toHaveBeenCalledTimes(1);

      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(leagueDraftCall).toHaveBeenCalledTimes(2);

      // The clock also runs in real time here, so the count is read well clear of the 5 s mark.
      await vi.advanceTimersByTimeAsync(4000);
      expect(leagueDraftCall).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(leagueDraftCall).toHaveBeenCalledTimes(3);
      component.stopFollowing();
    } finally {
      delete (document as unknown as { hidden?: boolean }).hidden;
    }
  });

  it('saves the switch with the board, on when it starts and cleared when it is switched off', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();

    component.toggleFollow();
    expect(savedDraft()?.following).toBe(true);

    component.toggleFollow();
    expect(component.following()).toBe(false);
    expect(savedDraft()?.following).toBeUndefined();
  });

  it("picks the league's draft back up when a board left following is opened again", async () => {
    loaded = projectionWith({
      ...boardFromLeagueDraft(handEnteredDraft, leagueDraft()),
      following: true,
    });
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const fixture = await renderFixture();
    fixture.detectChanges();
    const component = fixture.point.componentInstance;

    expect(leagueDraftCall).toHaveBeenCalledWith('465.l.9');
    expect(component.following()).toBe(true);
    expect(component.pendingFollow()).toBeNull();
    component.stopFollowing();
  });

  it('waits for the feature before picking the draft back up, and leaves a finished board alone', async () => {
    leagueDraftSync.set(false);
    loaded = projectionWith({
      ...boardFromLeagueDraft(handEnteredDraft, leagueDraft()),
      following: true,
    });
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const fixture = await renderFixture();
    fixture.detectChanges();
    const component = fixture.point.componentInstance;
    expect(leagueDraftCall).not.toHaveBeenCalled();

    leagueDraftSync.set(true);
    fixture.detectChanges();
    expect(component.following()).toBe(true);
    component.stopFollowing();
  });

  it('does not pick a finished board back up', async () => {
    loaded = projectionWith({
      ...boardFromLeagueDraft(handEnteredDraft, leagueDraft()),
      following: true,
      finishedAt: '2026-09-24T09:15:06Z',
    });
    const fixture = await renderFixture();
    fixture.detectChanges();

    expect(leagueDraftCall).not.toHaveBeenCalled();
    expect(fixture.point.componentInstance.following()).toBe(false);
  });

  it('forgets the switch when the user declines to replace picks entered by hand', async () => {
    loaded = projectionWith({
      ...boardFromLeagueDraft(handEnteredDraft, leagueDraft()),
      picks: [{ playerId: 7109, teamId: '465.l.9.t.2' }],
      following: true,
    });
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const fixture = await renderFixture();
    fixture.detectChanges();
    const component = fixture.point.componentInstance;
    expect(component.pendingFollow()).not.toBeNull();

    component.cancelFollow();
    expect(component.following()).toBe(false);
    expect(savedDraft()?.following).toBeUndefined();
    expect(savedDraft()?.picks).toEqual([{ playerId: 7109, teamId: '465.l.9.t.2' }]);
  });

  it('offers no Finish draft while following, and offers it again once sync is off', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    const finishButton = () => {
      fixture.detectChanges();
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Finish draft',
      );
    };
    expect(finishButton()).toBeDefined();

    component.requestFollow();
    expect(finishButton()).toBeUndefined();
    component.requestFinishDraft();
    expect(component.confirmingFinish()).toBe(false);

    component.toggleFollow();
    expect(finishButton()).toBeDefined();
  });

  it('counts every player the user drafted, including one the roster has no slot for', async () => {
    leagueDraftCall.mockReturnValue(
      of(
        leagueDraft([
          { overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 7109 },
          { overall: 2, round: 1, teamId: '465.l.9.t.1', playerId: 6743 },
          { overall: 3, round: 2, teamId: '465.l.9.t.1', playerId: 99999 },
        ]),
      ),
    );
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;
    component.requestFollow();

    expect(component.roster().unplaced).toEqual([99999]);
    expect(component.draftedCount()).toBe(2);
    fixture.detectChanges();
    expect(ngMocks.input('app-draft-roster-panel', 'draftedCount')).toBe(2);
    component.stopFollowing();
  });

  it('does not follow an auction draft', async () => {
    leagueDraftCall.mockReturnValue(of({ ...leagueDraft(), auction: true }));
    const component = await render();

    component.requestFollow();

    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe("Draft Mode can't follow an auction draft.");
    expect(updateProjection).not.toHaveBeenCalled();
  });

  it('stops when the league draft finishes, and finishes the board with it', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();
    expect(component.finished()).toBe(false);

    leagueDraftCall.mockReturnValue(
      of({
        ...leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }]),
        status: 'FINISHED',
      }),
    );
    await vi.advanceTimersByTimeAsync(5000);

    expect(component.picks()).toHaveLength(1);
    expect(component.following()).toBe(false);
    expect(component.finished()).toBe(true);
    expect(component.followNotice()).toBeNull();
    expect(updateProjection.mock.lastCall?.[1].data.draft?.finishedAt).toBeTruthy();
    // Nothing is left to follow, so the poll is over.
    leagueDraftCall.mockClear();
    await vi.advanceTimersByTimeAsync(15000);
    expect(leagueDraftCall).not.toHaveBeenCalled();
  });

  // Switching sync on for a draft Yahoo has already finished takes the whole board over in one
  // go and then has nothing left to follow. The board is finished with it, so the switch goes
  // away rather than sitting there off again, which read as a switch that refused to turn on.
  it('brings a finished draft over whole as a finished board, with no switch left', async () => {
    leagueDraftCall.mockReturnValue(
      of({
        ...leagueDraft([{ overall: 1, round: 1, teamId: '465.l.9.t.2', playerId: 6743 }]),
        status: 'FINISHED',
      }),
    );
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.requestFollow();
    component.confirmFollow();
    fixture.detectChanges();

    expect(component.picks()).toHaveLength(1);
    expect(component.following()).toBe(false);
    expect(component.finished()).toBe(true);
    expect(updateProjection).toHaveBeenCalledTimes(1);
    expect(updateProjection.mock.calls[0][1].data.draft?.finishedAt).toBeTruthy();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.sync-group')).toBeNull();
    expect(element.querySelector('.draft-tag--done')?.textContent).toContain('Finished');
    expect(element.textContent).toContain('View summary');
    expect(statusText(fixture)).toEqual('');
  });

  it('puts a notice beside the switch rather than on the line under the toolbar', async () => {
    leagueDraftCall.mockReturnValue(of({ ...leagueDraft(), auction: true }));
    const fixture = await renderFixture();
    const component = fixture.point.componentInstance;

    component.requestFollow();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.sync-group .sync-message--warn')?.textContent).toContain(
      "Draft Mode can't follow an auction draft.",
    );
    expect(statusText(fixture)).toEqual('');
  });

  describe('a draft set up without a league', () => {
    const withoutLeague = () =>
      projectionWith({
        ...handEnteredDraft,
        settings: { ...handEnteredDraft.settings!, yahooSync: undefined },
      });

    const leagueSettings = {
      scoringType: 'points' as const,
      statWeights: { goals: 2 },
      activeScoringColumns: ['goals', 'assists'],
      activeUtilityColumns: ['gp'],
      rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
      unsupportedRosterCodes: [],
      unsupportedStats: [],
    };

    beforeEach(() => {
      loaded = withoutLeague();
    });

    it('still offers the switch, which asks which league before it follows anything', async () => {
      const component = await render();

      expect(component.canFollow()).toBe(false);
      expect(component.canSyncPicks()).toBe(true);

      component.toggleFollow();

      expect(component.linkOpen()).toBe(true);
      expect(leagueDraftCall).not.toHaveBeenCalled();
    });

    it("follows the league it is given, keeping the draft's own settings", async () => {
      leagueDraftCall.mockReturnValue(of(leagueDraft()));
      const component = await render();
      component.toggleFollow();

      component.linkLeague({ leagueKey: '465.l.9', leagueName: 'Beer League', settings: null });

      expect(component.linkOpen()).toBe(false);
      expect(component.following()).toBe(true);
      expect(leagueDraftCall).toHaveBeenCalledWith('465.l.9');
      const saved = updateProjection.mock.calls[0][1].data.draft?.settings;
      expect(saved?.yahooSync?.leagueKey).toBe('465.l.9');
      expect(saved?.activeScoringColumns).toEqual(['goals']);
    });

    it("takes the league's settings when that is what was chosen", async () => {
      leagueDraftCall.mockReturnValue(of(leagueDraft()));
      const component = await render();

      component.linkLeague({
        leagueKey: '465.l.9',
        leagueName: 'Beer League',
        settings: leagueSettings,
      });

      expect(component.following()).toBe(true);
      const saved = updateProjection.mock.calls[0][1].data.draft?.settings;
      expect(saved?.activeScoringColumns).toEqual(['goals', 'assists']);
      expect(saved?.yahooSync?.leagueName).toBe('Beer League');
    });

    it("reopens the dialog on the way back from Yahoo's consent", async () => {
      returnedTo.mockReturnValue(true);

      expect((await render()).linkOpen()).toBe(true);
    });

    it('offers nothing where the feature is off', async () => {
      leagueDraftSync.set(false);

      const component = await render();

      expect(component.canSyncPicks()).toBe(false);
      component.toggleFollow();
      expect(component.linkOpen()).toBe(false);
    });
  });

  it('keeps trying through a dropped connection but stops when Yahoo refuses', async () => {
    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    const component = await render();
    component.requestFollow();

    leagueDraftCall.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.following()).toBe(true);
    expect(component.followNotice()).toBe('Sync unavailable at the moment.');

    leagueDraftCall.mockReturnValue(of(leagueDraft()));
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.followNotice()).toBeNull();

    leagueDraftCall.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 424 })));
    await vi.advanceTimersByTimeAsync(5000);
    expect(component.following()).toBe(false);
    expect(component.followNotice()).toBe("Yahoo refused access to this league's draft.");
  });
});
