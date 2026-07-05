import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { LeagueTeamsResponse } from '../../api/models/league-teams-response';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup';
import { YahooSyncResult } from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { YahooService } from '../../services/yahoo.service';
import { RosterSlots } from '../../api/models/roster-slots';
import { DEFAULT_ROSTER_SLOTS } from '../../draft-projection/projection-defaults';

describe('DraftSetupComponent', () => {
  const leagueTeams = vi.fn();

  beforeEach(() => {
    leagueTeams.mockReturnValue(of({ teams: [] }));
    return MockBuilder(DraftSetupComponent).mock(YahooService, { leagueTeams });
  });

  function renderSetup(rosterSlots: RosterSlots = DEFAULT_ROSTER_SLOTS): DraftSetupComponent {
    return MockRender(DraftSetupComponent, { initial: null, seedName: 'My Team', rosterSlots })
      .point.componentInstance;
  }

  function syncResult(leagueKey: string): YahooSyncResult {
    return {
      leagueKey,
      leagueName: 'HHL',
      settings: {
        scoringType: 'category',
        activeScoringColumns: [],
        activeUtilityColumns: [],
        rosterSlots: DEFAULT_ROSTER_SLOTS,
        unsupportedRosterCodes: [],
        unsupportedStats: [],
      },
    };
  }

  it('seeds a default 12-team league with exactly one mine', () => {
    const component = renderSetup();

    expect(component.numTeams()).toEqual(12);
    const mine = component.rows().filter((row) => row.mine);
    expect(mine.length).toEqual(1);
    expect(mine[0].name).toEqual('My Team');
  });

  it('adds and removes teams', () => {
    const component = renderSetup();

    component.addTeam();
    expect(component.numTeams()).toEqual(13);

    component.removeTeam();
    expect(component.numTeams()).toEqual(12);
  });

  it('reorders teams', () => {
    const component = renderSetup();
    const firstId = component.rows()[0].id;
    const secondId = component.rows()[1].id;

    component.reorder(0, 1);

    expect(component.rows()[0].id).toEqual(secondId);
    expect(component.rows()[1].id).toEqual(firstId);
  });

  it('emits the draft and roster slots on submit', () => {
    const component = renderSetup();
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.draft.teams.length).toEqual(12);
    expect(emitted?.draft.order.length).toEqual(12);
    expect(emitted?.draft.teams.filter((team) => team.mine).length).toEqual(1);
    expect(emitted?.draft.picks).toEqual([]);
    expect(emitted?.rosterSlots).toEqual(DEFAULT_ROSTER_SLOTS);
  });

  it('emits the roster slots it was given', () => {
    const custom: RosterSlots = { c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 };
    const component = renderSetup(custom);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.rosterSlots).toEqual(custom);
  });

  it('fills the team rows from a Yahoo sync, marking the owned team as mine', () => {
    leagueTeams.mockReturnValue(
      of({
        teams: [
          { name: 'Alpha', mine: false },
          { name: 'Bravo', mine: true },
          { name: 'Charlie', mine: false },
        ],
      }),
    );
    const component = renderSetup();

    component.onYahooSynced(syncResult('nhl.l.1'));

    expect(component.rows().map((row) => row.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    const mine = component.rows().filter((row) => row.mine);
    expect(mine.length).toEqual(1);
    expect(mine[0].name).toEqual('Bravo');
  });

  it('marks the first team as mine when Yahoo flags none', () => {
    leagueTeams.mockReturnValue(
      of({
        teams: [
          { name: 'Alpha', mine: false },
          { name: 'Bravo', mine: false },
        ],
      }),
    );
    const component = renderSetup();

    component.onYahooSynced(syncResult('nhl.l.1'));

    const mine = component.rows().filter((row) => row.mine);
    expect(mine.length).toEqual(1);
    expect(mine[0].name).toEqual('Alpha');
  });

  it('loads the teams on init when the projection was already synced', () => {
    leagueTeams.mockReturnValue(
      of({
        teams: [
          { name: 'Alpha', mine: true },
          { name: 'Bravo', mine: false },
        ],
      }),
    );
    const component = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      lastSync: { leagueKey: 'nhl.l.1', leagueName: 'HHL', syncedAt: '2026-07-05T00:00:00Z' },
    }).point.componentInstance;

    expect(leagueTeams).toHaveBeenCalledWith('nhl.l.1');
    expect(component.rows().map((row) => row.name)).toEqual(['Alpha', 'Bravo']);
    expect(component.loadingTeams()).toBe(false);
  });

  it('flags loadingTeams while the init fetch is still pending', () => {
    leagueTeams.mockReturnValue(new Subject<LeagueTeamsResponse>());
    const component = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      lastSync: { leagueKey: 'nhl.l.1', leagueName: 'HHL', syncedAt: '2026-07-05T00:00:00Z' },
    }).point.componentInstance;

    expect(component.loadingTeams()).toBe(true);
  });

  it('keeps the existing teams when a draft already has picks', () => {
    leagueTeams.mockReturnValue(of({ teams: [{ name: 'Alpha', mine: true }] }));
    const component = MockRender(DraftSetupComponent, {
      initial: {
        teams: [
          { id: 'team-me', name: 'My Team', mine: true },
          { id: 'team-1', name: 'Team 1', mine: false },
        ],
        order: ['team-me', 'team-1'],
        picks: [{ playerId: 1, teamId: 'team-me' }],
      },
      seedName: 'My Team',
      rosterSlots: DEFAULT_ROSTER_SLOTS,
    }).point.componentInstance;

    component.onYahooSynced(syncResult('nhl.l.1'));

    expect(component.rows().map((row) => row.name)).toEqual(['My Team', 'Team 1']);
  });
});
