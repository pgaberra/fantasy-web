import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { LeagueTeamsResponse } from '../../api/models/league-teams-response';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup';
import { YahooSyncResult } from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { YahooService } from '../../services/yahoo.service';
import { EspnService } from '../../services/espn.service';
import { RosterSlots } from '../../api/models/roster-slots';
import { DEFAULT_ROSTER_SLOTS } from '../../draft-projection/projection-defaults';

describe('DraftSetupComponent', () => {
  const leagueTeams = vi.fn();
  const espnLeagueTeams = vi.fn();

  beforeEach(() => {
    leagueTeams.mockReset();
    espnLeagueTeams.mockReset();
    leagueTeams.mockReturnValue(of({ teams: [] }));
    espnLeagueTeams.mockReturnValue(of({ teams: [] }));
    return MockBuilder(DraftSetupComponent)
      .mock(YahooService, { leagueTeams })
      .mock(EspnService, { leagueTeams: espnLeagueTeams });
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

  it('seeds the team count from the projection league size', () => {
    const component = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      leagueSize: 8,
    }).point.componentInstance;

    expect(component.numTeams()).toEqual(8);
    expect(component.rows().filter((row) => row.mine).length).toEqual(1);
  });

  // A league imported on the page the draft was started from is ESPN's as often as Yahoo's.
  it('takes the size and your seat from the ESPN league the projection was imported from', () => {
    espnLeagueTeams.mockReturnValue(
      of({
        teams: [
          { name: 'Ice Holes', mine: false },
          { name: 'Puck Luck', mine: true },
        ],
        draftPosition: 2,
      }),
    );

    const component = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      lastEspnSync: { leagueName: 'ESPN league', leagueId: '42', syncedAt: '2026-09-17T08:00:00Z' },
    }).point.componentInstance;

    expect(espnLeagueTeams).toHaveBeenCalledWith('42');
    expect(leagueTeams).not.toHaveBeenCalled();
    expect(component.numTeams()).toEqual(2);
    expect(component.myPosition()).toEqual(2);
    expect(component.rows().map((row) => row.name)).toEqual(['', 'Puck Luck']);
  });

  it('adds and removes teams', () => {
    const component = renderSetup();

    component.addTeam();
    expect(component.numTeams()).toEqual(13);

    component.removeTeam();
    expect(component.numTeams()).toEqual(12);
  });

  it('moves your team to the chosen draft position, keeping the others in order', () => {
    const component = renderSetup();
    const others = component
      .rows()
      .filter((row) => !row.mine)
      .map((row) => row.id);

    component.setMyPosition(5);

    expect(component.myPosition()).toEqual(5);
    expect(
      component
        .rows()
        .filter((row) => !row.mine)
        .map((row) => row.id),
    ).toEqual(others);

    component.setMyPosition(99);
    expect(component.myPosition()).toEqual(12);
  });

  it('names the other teams by number, and your team by its own name', () => {
    const component = renderSetup();
    component.setMyPosition(2);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    const names = emitted?.draft.order.map(
      (id) => emitted?.draft.teams.find((team) => team.id === id)?.name,
    );
    expect(names?.slice(0, 4)).toEqual(['Team 1', 'My Team', 'Team 2', 'Team 3']);
  });

  it('keeps your seat when a team is removed from behind it', () => {
    const component = renderSetup();
    component.setMyPosition(12);

    component.removeTeam();

    expect(component.numTeams()).toEqual(11);
    expect(component.myPosition()).toEqual(11);
  });

  it('emits the draft and roster slots on submit', () => {
    const component = renderSetup();
    component.setMyPosition(1);
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
    component.setMyPosition(1);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.rosterSlots).toEqual(custom);
  });

  it("takes the size and your seat from a Yahoo sync, and your team's name", () => {
    leagueTeams.mockReturnValue(
      of({
        teams: [
          { name: 'Alpha', mine: false },
          { name: 'Bravo', mine: true },
          { name: 'Charlie', mine: false },
        ],
        draftPosition: 2,
      }),
    );
    const component = renderSetup();

    component.onYahooSynced(syncResult('nhl.l.1'));

    expect(component.numTeams()).toEqual(3);
    expect(component.myPosition()).toEqual(2);
    expect(component.draftPositionKnown()).toBe(true);
    const mine = component.rows().filter((row) => row.mine);
    expect(mine.length).toEqual(1);
    expect(mine[0].name).toEqual('Bravo');
  });

  // The seat the league names is the only one worth taking: where a team sits in a team list is
  // not where it drafts, and a league that lists you tenth can still have you picking twelfth.
  it('seats you where the league says, not where your team sits in its list', () => {
    leagueTeams.mockReturnValue(
      of({
        teams: [
          { name: 'Delta', mine: true },
          { name: 'Alpha', mine: false },
          { name: 'Bravo', mine: false },
          { name: 'Charlie', mine: false },
        ],
        draftPosition: 4,
      }),
    );
    const component = renderSetup();

    component.onYahooSynced(syncResult('nhl.l.1'));

    expect(component.myPosition()).toEqual(4);
    expect(component.rows()[3].name).toEqual('Delta');
  });

  it('asks for your seat, and will not start, when the league names none', () => {
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
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.onYahooSynced(syncResult('nhl.l.1'));

    expect(component.draftPositionKnown()).toBe(false);
    expect(component.canStart()).toBe(false);

    component.submit();
    expect(emitted).toBeUndefined();

    component.setMyPosition(3);

    expect(component.canStart()).toBe(true);
    component.submit();
    expect(emitted?.draft.order.length).toEqual(3);
  });

  it('keeps the seat a saved setup already carries', () => {
    const component = MockRender(DraftSetupComponent, {
      initial: {
        teams: [
          { id: 'team-1', name: 'Team 1', mine: false },
          { id: 'team-me', name: 'My Team', mine: true },
        ],
        order: ['team-1', 'team-me'],
        picks: [],
      },
      seedName: 'My Team',
      rosterSlots: DEFAULT_ROSTER_SLOTS,
    }).point.componentInstance;

    expect(component.draftPositionKnown()).toBe(true);
    expect(component.myPosition()).toEqual(2);
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
    expect(component.myPosition()).toEqual(1);
    expect(component.draftPositionKnown()).toBe(false);
    expect(mine[0].name).toEqual('My Team');
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
    expect(component.numTeams()).toEqual(2);
    expect(component.myPosition()).toEqual(1);
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
