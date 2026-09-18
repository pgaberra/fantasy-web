import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { createDefaultProjectionState } from '../draft-projection/projection-defaults';
import { draftSettingsFromProjection } from '../shared/league-settings/league-settings';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../services/notification.service';
import { StatInfoService } from '../services/stat-info.service';
import { DraftModeComponent } from './draft-mode';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionCalculationService } from '../services/projection-calculation.service';
import { PositionFilterService } from '../services/position-filter.service';
import { Player } from '../models/player.model';
import { SkaterStats } from '../models/projection.model';
import { ProjectionResponse } from '../api/models/projection-response';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';
import { DraftState } from '../api/models/draft-state';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { TierService } from '../services/tier.service';
import { environment } from '../../environments/environment';

describe('DraftModeComponent', () => {
  const players: Player[] = [
    { id: 1, type: 'skater', name: 'McDavid', positions: new Set(['C']), stats: {} as SkaterStats },
    { id: 2, type: 'skater', name: 'Makar', positions: new Set(['D']), stats: {} as SkaterStats },
  ];

  const projection: ProjectionResponse = {
    id: 'p1',
    kind: 'projection',
    name: 'My Projection',
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
        leagueSize: 12,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
        minGoalieGames: 25,
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
              goals: 60,
            },
          },
        },
        {
          playerId: 2,
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
              goals: 20,
            },
          },
        },
      ],
    },
  };

  const draft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
  };

  const updateProjection = vi.fn<
    (id: string, request: UpdateProjectionRequest) => Observable<ProjectionResponse>
  >(() => of(projection));

  let loadedProjection: ProjectionResponse = projection;

  beforeEach(() => {
    updateProjection.mockClear();
    loadedProjection = projection;
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .keep(TierService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(loadedProjection),
        updateProjection,
      })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'p1' : null) } },
        },
      });
  });

  /**
   * The tier strip answers the question a manager is actually asking mid-draft: how much of the
   * best tier left at each position is still on the board. What matters is that it counts only
   * undrafted players and that it goes quiet when the feature is off.
   */
  describe('tiers', () => {
    const originalFlag = environment.tiersEnabled;

    beforeEach(() => {
      environment.tiersEnabled = true;
    });

    afterEach(() => {
      environment.tiersEnabled = originalFlag;
    });

    it('reports nothing while the feature is off', async () => {
      environment.tiersEnabled = false;
      const fixture = MockRender(DraftModeComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      component.applySetup(draft);

      expect(component.tierStrip()).toEqual([]);
      expect(component.tierBadges().size).toBe(0);
    });

    it('counts the best tier left at each position', async () => {
      const fixture = MockRender(DraftModeComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      component.applySetup(draft);

      const byPosition = new Map(component.tierStrip().map((entry) => [entry.position, entry]));
      expect(byPosition.get('C')?.remaining).toBe(1);
      expect(byPosition.get('D')?.remaining).toBe(1);
    });

    it('drops a drafted player out of the count', async () => {
      const fixture = MockRender(DraftModeComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      component.applySetup(draft);

      component.draftCurrent(2);

      expect(component.tierStrip().some((entry) => entry.position === 'D')).toBe(false);
    });

    it('marks a position the roster has no room for', async () => {
      const fixture = MockRender(DraftModeComponent);
      await fixture.whenStable();
      const component = fixture.point.componentInstance;
      component.onSetupConfirmed({
        draft,
        rosterSlots: { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
      });

      const defense = component.tierStrip().find((entry) => entry.position === 'D');
      expect(defense?.needed).toBe(false);
    });
  });

  it('starts in setup when the projection has no draft', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.phase()).toEqual('setup');
  });

  it('applies a setup, enters the draft phase and persists', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.applySetup(draft);

    expect(component.phase()).toEqual('draft');
    expect(component.isMyPick()).toBe(true);
    expect(component.draftLabel()).toEqual('Draft');
    expect(updateProjection).toHaveBeenCalled();
  });

  // Draft mode never edits a player's stats, so re-uploading ~0.5 MB of rows on every pick was
  // pure waste — and the upload that fails on a slow connection.
  it('persists the draft without re-sending the player rows', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.applySetup(draft);

    const sent = updateProjection.mock.calls[0][1];
    expect(sent.data.players).toBeUndefined();
    expect(sent.data.settings).toBeDefined();
  });

  it('applies the roster slots chosen in setup', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.onSetupConfirmed({
      draft,
      rosterSlots: { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
    });

    expect(component.rosterSlots()).toEqual({ c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 });
    expect(component.totalSlots()).toEqual(1);
    expect(component.phase()).toEqual('draft');
  });

  it('applies a Yahoo sync to the draft, never to the projection it is played against', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);
    updateProjection.mockClear();

    component.applyYahooSync({
      leagueName: 'My Yahoo League',
      leagueKey: 'nhl.l.123',
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals', 'assists'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 },
        leagueSize: 10,
        statWeights: { goals: 1 },
        unsupportedRosterCodes: [],
        unsupportedStats: [],
      },
    });

    expect(component.rosterSlots()).toEqual({ c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 });
    expect(component.yahooSync()).toEqual({
      leagueName: 'My Yahoo League',
      leagueKey: 'nhl.l.123',
      syncedAt: expect.any(String),
    });
    expect(updateProjection).toHaveBeenCalledOnce();
    const sent = updateProjection.mock.calls[0][1].data;
    expect(sent.draft?.settings?.yahooSync?.leagueKey).toEqual('nhl.l.123');
    expect(sent.draft?.settings?.scoringType).toEqual('category');
    // The projection's own settings go back exactly as they were loaded.
    expect(sent.settings).toEqual(projection.data.settings);
  });

  it('holds a sync made before the draft exists until its setup is confirmed', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    updateProjection.mockClear();

    component.applyEspnSync({
      leagueId: '42',
      leagueName: 'Puck Luck',
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 },
        unsupportedRosterCodes: [],
        unsupportedStats: [],
      },
    });
    expect(updateProjection).not.toHaveBeenCalled();

    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });

    const sent = updateProjection.mock.calls[0][1].data;
    expect(sent.draft?.settings?.espnSync?.leagueId).toEqual('42');
    expect(sent.settings).toEqual(projection.data.settings);
  });

  it("ranks a draft by the league it holds rather than the projection's", async () => {
    const withLeague: ProjectionResponse = {
      ...projection,
      data: {
        ...projection.data,
        draft: {
          ...draft,
          settings: {
            scoringType: 'category',
            statWeights: {},
            activeScoringColumns: ['goals'],
            activeUtilityColumns: ['gp'],
            leagueSize: 6,
            rosterSlots: { c: 1, lw: 1, rw: 1, d: 2, util: 0, bn: 1, g: 1 },
          },
        },
      },
    };
    loadedProjection = withLeague;
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.scoringType()).toEqual('category');
    expect(component.leagueSize()).toEqual(6);
    expect(component.scoreHeading()).toEqual('Z-Score');
  });

  it('ranks teams by projected total in the league projection', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    const projection = component.leagueProjection();
    expect(projection.teams.map((team) => team.teamId)).toEqual(['team-me', 'team-1']);
    expect(projection.teams[0].total).toBeGreaterThan(projection.teams[1].total);
    // Category cells hold the z-score contribution (not the raw stat): McDavid's 60 goals is +1σ
    // over the two-skater pool, and a team's category cells sum to its total.
    expect(projection.teams[0].values['goals']).toBeCloseTo(1, 5);
    expect(projection.teams[0].total).toBeCloseTo(projection.teams[0].values['goals'], 5);
    expect(projection.categoryColumns.map((column) => column.key)).toEqual(['goals']);
    expect(projection.positionColumns.map((column) => column.key)).toEqual([
      'LW',
      'C',
      'RW',
      'D',
      'UTIL',
      'G',
      'BN',
    ]);
  });

  it('confirms before finishing, then toggles the summary view', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.requestFinishDraft();
    expect(component.confirmingFinish()).toBe(true);
    expect(component.showSummary()).toBe(false);

    component.cancelFinish();
    expect(component.confirmingFinish()).toBe(false);
    expect(component.showSummary()).toBe(false);

    component.requestFinishDraft();
    component.finishDraft();
    expect(component.confirmingFinish()).toBe(false);
    expect(component.showSummary()).toBe(true);

    component.backToDraft();
    expect(component.showSummary()).toBe(false);
  });

  it('stamps finishedAt and marks the draft finished on finish', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    expect(component.finished()).toBe(false);

    component.requestFinishDraft();
    component.finishDraft();

    expect(component.draft()?.finishedAt).toEqual(expect.any(String));
    expect(component.finished()).toBe(true);
    expect(component.showSummary()).toBe(true);
  });

  it('confirms before finishing even when the board is complete', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.onSetupConfirmed({
      draft,
      rosterSlots: { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
    });

    component.draftCurrent(1);
    component.draftCurrent(2);
    expect(component.isComplete()).toBe(true);

    component.requestFinishDraft();
    expect(component.confirmingFinish()).toBe(true);
    expect(component.showSummary()).toBe(false);
    expect(component.finished()).toBe(false);

    component.finishDraft();
    expect(component.confirmingFinish()).toBe(false);
    expect(component.showSummary()).toBe(true);
    expect(component.finished()).toBe(true);
  });

  it('reopens a finished draft on any pick edit, including a swap that stays full', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.onSetupConfirmed({
      draft,
      rosterSlots: { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
    });
    component.draftCurrent(1);
    component.draftCurrent(2);
    component.finishDraft();
    expect(component.finished()).toBe(true);

    // Even a swap that leaves every slot filled reopens the draft.
    component.startEditPick(1);
    component.replacePick(99);
    expect(component.isComplete()).toBe(true);
    expect(component.finished()).toBe(false);
    expect(component.draft()?.finishedAt).toBeFalsy();
  });

  it('drafts the next pick, removes them from available and advances the order', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);

    expect(component.roster().slots.find((slot) => slot.playerId === 1)?.slotKey).toEqual('c');
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.filledCount()).toEqual(1);
    expect(component.pickNumber()).toEqual(2);
    expect(component.upNextTeam()?.id).toEqual('team-1');
    expect(component.isMyPick()).toBe(false);
    expect(component.draftLabel()).toEqual('Draft for Team 1');
  });

  it('filters on several positions at once and falls back to all when none are left', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.togglePositionFilter('C');

    expect(component.selectedPositions()).toEqual(['C']);
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([1]);

    component.togglePositionFilter('D');

    expect(component.selectedPositions()).toEqual(['C', 'D']);
    expect(
      component
        .available()
        .map((sp) => sp.projection.playerId)
        .sort((first, second) => first - second),
    ).toEqual([1, 2]);

    component.togglePositionFilter('C');

    expect(component.selectedPositions()).toEqual(['D']);
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);

    component.togglePositionFilter('D');

    expect(component.selectedPositions()).toEqual(['ALL']);
    expect(
      component
        .available()
        .map((sp) => sp.projection.playerId)
        .sort((first, second) => first - second),
    ).toEqual([1, 2]);
  });

  /**
   * The number beside a row is the player's place on the whole board. It used to be his place in
   * the list on screen, so Porter Martone read 1 when searched for and 157 when scrolled to.
   */
  it('keeps a searched player at his place on the board', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.searchTerm.set('makar');

    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.boardRanks().get(2)).toEqual(2);
  });

  it("keeps a player's place on the board under the position chips", async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.togglePositionFilter('D');

    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.boardRanks().get(2)).toEqual(2);
  });

  it("keeps a player's place on the board once the players above him are drafted", async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);

    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.boardRanks().get(2)).toEqual(2);
  });

  it('drops the other positions when All is picked', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.togglePositionFilter('C');
    component.togglePositionFilter('D');
    component.togglePositionFilter('ALL');

    expect(component.selectedPositions()).toEqual(['ALL']);
  });

  it('attributes a pick to the next team and undoes the last pick', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    expect(component.available().length).toEqual(0);
    expect(component.filledCount()).toEqual(1);
    expect(component.roster().slots.find((slot) => slot.playerId === 2)).toBeUndefined();

    component.undoLast();

    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([2]);
    expect(component.pickNumber()).toEqual(2);
  });

  it('shows another team roster when a different team is selected', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    expect(component.roster().slots.find((slot) => slot.playerId === 1)).toBeDefined();
    expect(component.roster().slots.find((slot) => slot.playerId === 2)).toBeUndefined();

    component.viewedTeamId.set('team-1');

    expect(component.effectiveTeamId()).toEqual('team-1');
    expect(component.roster().slots.find((slot) => slot.playerId === 2)).toBeDefined();
    expect(component.roster().slots.find((slot) => slot.playerId === 1)).toBeUndefined();
  });

  it('groups picks into rounds, newest round and pick first', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    const rounds = component.pickRounds();
    expect(rounds.map((round) => round.round)).toEqual([2, 1]);
    expect(rounds[0].picks.map((entry) => entry.overall)).toEqual([3]);
    expect(rounds[1].picks.map((entry) => entry.overall)).toEqual([2, 1]);
    expect(rounds[1].picks[0].mine).toBe(false);
    expect(rounds[1].picks[1].mine).toBe(true);
  });

  it('builds ascending draft-result rounds with round-relative pick numbers', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    const rounds = component.resultRounds();
    expect(rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(rounds[0].picks.map((pick) => pick.pickInRound)).toEqual([1, 2]);
    expect(rounds[0].picks.map((pick) => pick.overall)).toEqual([1, 2]);
    expect(rounds[0].picks.map((pick) => pick.playerId)).toEqual([1, 2]);
    expect(rounds[0].picks[0].mine).toBe(true);
    expect(rounds[0].picks[1].teamName).toEqual('Team 1');
    expect(rounds[1].picks[0].pickInRound).toEqual(1);
    expect(rounds[1].picks[0].overall).toEqual(3);
    expect(rounds[1].picks[0].playerId).toEqual(3);
  });

  it('groups draft results by team in draft order with overall pick numbers', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    const teams = component.resultTeams();
    expect(teams.map((entry) => entry.team.id)).toEqual(['team-me', 'team-1']);
    expect(teams[0].picks).toEqual([{ overall: 1, playerId: 1 }]);
    expect(teams[1].picks).toEqual([
      { overall: 2, playerId: 2 },
      { overall: 3, playerId: 3 },
    ]);
  });

  it('replaces a player at a specific pick and frees the old one', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);

    component.startEditPick(1);
    component.replacePick(99);

    expect(component.picks()[0]).toEqual({ playerId: 99, teamId: 'team-me' });
    expect(component.picks()[1]).toEqual({ playerId: 2, teamId: 'team-1' });
    expect(component.editingPick()).toBeNull();
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([1]);
  });

  it('removes a pick and shifts later picks up, re-attributing by position', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    component.removePick(1);

    expect(component.picks()).toEqual([
      { playerId: 2, teamId: 'team-me' },
      { playerId: 3, teamId: 'team-1' },
    ]);
    expect(component.available().map((sp) => sp.projection.playerId)).toEqual([1]);
  });

  it('asks before removing an earlier pick and lists the shifts', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    component.requestRemovePick(1);

    expect(component.pendingRemoval()).toEqual(1);
    expect(component.picks().length).toEqual(3);
    const preview = component.removalPreview();
    expect(preview?.changes.length).toEqual(2);
    expect(preview?.changes[0].playerId).toEqual(2);
    expect(preview?.changes[0].oldOverall).toEqual(2);
    expect(preview?.changes[0].newOverall).toEqual(1);
    expect(preview?.changes[0].oldTeamName).toEqual('Team 1');
    expect(preview?.changes[0].newTeamName).toEqual('My Team');
    expect(preview?.changes[0].affectsMine).toBe(true);
    expect(preview?.changes[1].affectsMine).toBe(false);

    component.confirmRemovePick();

    expect(component.pendingRemoval()).toBeNull();
    expect(component.picks()).toEqual([
      { playerId: 2, teamId: 'team-me' },
      { playerId: 3, teamId: 'team-1' },
    ]);
  });

  it('removes the last pick directly without confirmation', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.draftCurrent(1);
    component.draftCurrent(2);
    component.draftCurrent(3);

    component.requestRemovePick(3);

    expect(component.pendingRemoval()).toBeNull();
    expect(component.picks().length).toEqual(2);
  });

  it('defaults the roster view to my team even when I am not first in the order', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup({
      teams: [
        { id: 'team-1', name: 'Team 1', mine: false },
        { id: 'team-me', name: 'My Team', mine: true },
      ],
      order: ['team-1', 'team-me'],
      picks: [],
    });
    fixture.detectChanges();

    expect(component.effectiveTeamId()).toEqual('team-me');
  });
});

describe('DraftModeComponent — available pagination', () => {
  const manyPlayers: Player[] = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    type: 'skater',
    name: `Player ${i + 1}`,
    positions: new Set(['C']),
    stats: {} as SkaterStats,
  }));

  const bigProjection: ProjectionResponse = {
    id: 'p2',
    kind: 'projection',
    name: 'Big Board',
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
        leagueSize: 12,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
        minGoalieGames: 25,
      },
      players: manyPlayers.map((player, i) => ({
        playerId: player.id,
        type: 'skater' as const,
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
            goals: 120 - i,
          },
        },
      })),
    },
  };

  const draft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
  };

  beforeEach(() =>
    MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .mock(PlayerService, { getPlayers: () => of(manyPlayers) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(bigProjection),
        updateProjection: vi.fn(() => of(bigProjection)),
      })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'p2' : null) } },
        },
      }),
  );

  it('defaults to 50 players per page and reveals more on show more', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    expect(component.available().length).toEqual(120);
    expect(component.pageSize()).toEqual(50);
    expect(component.visibleAvailable().length).toEqual(50);
    expect(component.hasMoreAvailable()).toBe(true);

    component.showMore();

    expect(component.visibleAvailable().length).toEqual(100);
    expect(component.hasMoreAvailable()).toBe(true);

    component.showMore();

    expect(component.visibleAvailable().length).toEqual(120);
    expect(component.hasMoreAvailable()).toBe(false);
  });

  it('resets to the first page when the position filter changes', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);
    component.showMore();
    component.showMore();
    expect(component.visibleAvailable().length).toEqual(120);

    component.togglePositionFilter('C');

    expect(component.visibleAvailable().length).toEqual(50);
  });

  it('honors a user-chosen page size', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;
    component.applySetup(draft);

    component.pageSize.set(200);
    expect(component.visibleAvailable().length).toEqual(120);
    expect(component.hasMoreAvailable()).toBe(false);

    component.pageSize.set(50);
    expect(component.visibleAvailable().length).toEqual(50);
    expect(component.hasMoreAvailable()).toBe(true);
  });
});

describe('DraftModeComponent — finished draft', () => {
  const players: Player[] = [
    { id: 1, type: 'skater', name: 'McDavid', positions: new Set(['C']), stats: {} as SkaterStats },
    { id: 2, type: 'skater', name: 'Makar', positions: new Set(['D']), stats: {} as SkaterStats },
  ];

  const finishedProjection: ProjectionResponse = {
    id: 'p1',
    kind: 'projection',
    name: 'My Projection',
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
        leagueSize: 12,
        rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
        minGoalieGames: 25,
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
              goals: 60,
            },
          },
        },
        {
          playerId: 2,
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
              goals: 20,
            },
          },
        },
      ],
      draft: {
        teams: [
          { id: 'team-me', name: 'My Team', mine: true },
          { id: 'team-1', name: 'Team 1', mine: false },
        ],
        order: ['team-me', 'team-1'],
        picks: [{ playerId: 1, teamId: 'team-me' }],
        finishedAt: '2026-07-15T10:00:00.000Z',
      },
    },
  };

  beforeEach(() =>
    MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, {
        loadProjection: () => of(finishedProjection),
        updateProjection: vi.fn(() => of(finishedProjection)),
      })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'p1' : null) } },
        },
      }),
  );

  it('opens directly on the summary when the draft is already finished', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    expect(component.finished()).toBe(true);
    expect(component.showSummary()).toBe(true);
    expect(component.phase()).toEqual('draft');
  });

  it('edits the draft back on the board without un-finishing it', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.backToDraft();

    expect(component.showSummary()).toBe(false);
    expect(component.finished()).toBe(true);
  });

  it('reopens the draft when a pick is removed after Edit draft', async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.backToDraft();
    component.undoLast();

    expect(component.finished()).toBe(false);
    expect(component.draft()?.finishedAt).toBeFalsy();
  });
});

/**
 * A preset draft is not saved until its setup is confirmed. Start used to create the board first,
 * and backing out of the setup left an empty board behind for every press.
 */
describe('DraftModeComponent — a preset draft not saved yet', () => {
  const players: Player[] = [
    { id: 1, type: 'skater', name: 'McDavid', positions: new Set(['C']), stats: {} as SkaterStats },
  ];

  const draft: DraftState = {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [],
  };

  const navigate = vi.fn(() => Promise.resolve(true));
  const createProjection = vi.fn();
  const loadProjection = vi.fn();
  const updateProjection = vi.fn();
  const notifyError = vi.fn();
  let presetParam: string | null = 'model';

  beforeEach(() => {
    presetParam = 'model';
    history.replaceState(null, '');
    navigate.mockClear();
    createProjection.mockReset();
    createProjection.mockReturnValue(of({ id: 'model1' }));
    loadProjection.mockClear();
    updateProjection.mockClear();
    notifyError.mockClear();
    return MockBuilder(DraftModeComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(PositionFilterService)
      .keep(DraftPlayerLookupService)
      .keep(StatInfoService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, { loadProjection, updateProjection, createProjection })
      .mock(NotificationService, { error: notifyError })
      .provide({ provide: Router, useValue: { navigate } })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'preset' ? presetParam : null) } },
        },
      });
  });

  const render = async () => {
    const fixture = MockRender(DraftModeComponent);
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  it('opens on the setup with nothing loaded or saved', async () => {
    const component = await render();

    expect(component.loaded()).toBe(true);
    expect(component.phase()).toEqual('setup');
    expect(component.projectionName()).toEqual('AI Projection');
    expect(component.exitLink()).toEqual(['/draft']);
    expect(loadProjection).not.toHaveBeenCalled();
    expect(createProjection).not.toHaveBeenCalled();
    expect(updateProjection).not.toHaveBeenCalled();
  });

  it('keeps a league sync made during the setup in memory until the draft is saved', async () => {
    const component = await render();

    component.applyYahooSync({
      leagueName: 'My Yahoo League',
      leagueKey: 'nhl.l.123',
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp'],
        rosterSlots: { c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 },
        leagueSize: 10,
        unsupportedRosterCodes: [],
        unsupportedStats: [],
      },
    });

    expect(updateProjection).not.toHaveBeenCalled();
    expect(createProjection).not.toHaveBeenCalled();

    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });

    expect(createProjection.mock.calls[0][0].data.draft.settings.yahooSync.leagueKey).toEqual(
      'nhl.l.123',
    );
  });

  // Set on the draft picker, which saves nothing, so it arrives in the navigation's state.
  it('creates the board with the league set on the draft picker', async () => {
    const serializer = ngMocks.findInstance(ProjectionSerializerService);
    const { settings } = serializer.toProjectionData({
      ...createDefaultProjectionState(() => false),
      scoringType: 'category',
      leagueSize: 8,
    });
    history.replaceState({ draftLeagueSettings: draftSettingsFromProjection(settings) }, '');
    const component = await render();

    expect(component.scoringType()).toEqual('category');
    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });

    const request = createProjection.mock.calls[0][0];
    expect(request.data.draft.settings.scoringType).toEqual('category');
    expect(request.data.draft.settings.leagueSize).toEqual(8);
    // The board itself keeps a new projection's defaults.
    expect(request.data.settings.scoringType).toEqual('points');
  });

  it('creates the board with its setup once confirmed, then opens the board', async () => {
    const component = await render();

    component.onSetupConfirmed({
      draft,
      rosterSlots: { c: 1, lw: 0, rw: 0, d: 0, util: 0, bn: 0, g: 0 },
    });

    expect(createProjection).toHaveBeenCalledOnce();
    const request = createProjection.mock.calls[0][0];
    expect(request.kind).toEqual('preset_draft');
    expect(request.source).toEqual('model');
    expect(request.data.players).toEqual([]);
    expect(request.data.draft).toEqual({ ...draft, settings: expect.any(Object) });
    expect(request.data.draft.settings.rosterSlots).toEqual({
      c: 1,
      lw: 0,
      rw: 0,
      d: 0,
      util: 0,
      bn: 0,
      g: 0,
    });
    expect(navigate).toHaveBeenCalledWith(['/projections', 'model1', 'draft'], {
      replaceUrl: true,
    });
  });

  it('creates one board however often the setup is confirmed while it saves', async () => {
    createProjection.mockReturnValue(new Observable());
    const component = await render();

    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });
    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });

    expect(createProjection).toHaveBeenCalledOnce();
  });

  it('stays on the setup and says so when the board cannot be created', async () => {
    createProjection.mockReturnValue(throwError(() => new Error('boom')));
    const component = await render();

    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });

    expect(notifyError).toHaveBeenCalledWith("Couldn't start the draft. Please try again.");
    expect(component.phase()).toEqual('setup');
    expect(component.saveStatus()).toEqual('idle');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says what a refused draft actually needs, rather than telling anyone to retry', async () => {
    createProjection.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const component = await render();

    component.onSetupConfirmed({ draft, rosterSlots: component.rosterSlots() });

    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining('part of Premium'));
  });

  it('goes back to the start page for a preset it does not know', async () => {
    presetParam = 'nonsense';
    await render();

    expect(navigate).toHaveBeenCalledWith(['/draft']);
  });
});
