import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { Projection } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import {
  FaScoutService,
  ScoutList,
  ScoutPlayer,
  ScoutTeam,
  TeamPlayer,
} from '../services/fa-scout.service';
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { FaScoutComponent, SCOUT_PAGE_SIZE } from './fa-scout';
import { ScoutTableComponent } from './scout-table/scout-table';

const LEAGUE: ChosenLeague = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };

const SETTINGS: LeagueProjectionSettingsResponse = {
  leagueName: 'The Gordie Howes',
  scoringType: 'points',
  statWeights: { goals: 3, assists: 2 },
  activeScoringColumns: ['goals', 'assists'],
  activeUtilityColumns: ['gp'],
  // No goalie seats and no bench, so the team below fills the roster to the last spot.
  rosterSlots: { c: 2, lw: 2, rw: 2, w: 0, f: 0, d: 4, g: 0, util: 1, bn: 0 },
  leagueSize: 12,
  unsupportedRosterCodes: [],
  unsupportedStats: [],
};

function skater(playerId: number, goals: number, assists: number, games = 70): Projection {
  return {
    type: 'skater',
    playerId,
    stats: {
      scoring: { goals, assists } as never,
      utility: { gp: games, toiPerGame: 1100 },
    },
  };
}

function goalie(playerId: number): Projection {
  return {
    type: 'goalie',
    playerId,
    // A whole line, as the service hands the ranking engine one: every goalie stat, zero or not.
    stats: {
      scoring: { ...Object.fromEntries(GOALIE_SCORING_STAT_KEYS.map((key) => [key, 0])), w: 20 },
      utility: { gp: 40 },
    },
  } as Projection;
}

function scoutPlayer(
  now: Projection,
  preseason: Projection | null,
  positions: string[] = ['C'],
): ScoutPlayer {
  return {
    freeAgent: {
      projection: now,
      playerId: String(now.playerId),
      name: `Player ${now.playerId}`,
      teamAbbrev: 'SEA',
      positions,
      availability: 'FREE_AGENT',
      clubGames: now.stats.utility.gp,
      expectedGames: now.stats.utility.gp,
      projected: new Set(['goals', 'assists']),
    },
    preseason,
  };
}

/**
 * Twenty depth forwards the model rated the same in September and now, one defenceman who has
 * since taken a top role, and a goalie.
 */
function wire(): ScoutList {
  const depth = Array.from({ length: 20 }, (_, index) =>
    scoutPlayer(skater(index + 1, 10, 20 - index * 0.5), skater(index + 1, 10, 20 - index * 0.5)),
  );
  return {
    inSeason: true,
    preseasonAvailable: true,
    players: [
      ...depth,
      scoutPlayer(skater(99, 12, 40), skater(99, 4, 10), ['D']),
      scoutPlayer(goalie(50), goalie(50), ['G']),
    ],
  };
}

function teamPlayer(now: Projection, positions: string[], reserve = false): TeamPlayer {
  return {
    playerId: String(now.playerId),
    name: `Mine ${now.playerId}`,
    teamAbbrev: 'EDM',
    type: now.type,
    positions,
    reserve,
    out: reserve,
    reserveEligible: [],
    projection: now,
  };
}

/**
 * The user's team against the league's 2 C / 2 LW / 2 RW / 4 D / 1 Util lineup, a full roster: seven
 * forwards for the seven forward and Util seats, the weakest C starting at Util, exactly four D (the
 * worst of them only replaceable by a D), and a player on injured reserve who holds no roster spot.
 */
function team(): ScoutTeam {
  return {
    found: true,
    teamName: 'Slapshots',
    players: [
      teamPlayer(skater(201, 40, 50), ['C']),
      teamPlayer(skater(202, 1, 2), ['C']),
      teamPlayer(skater(203, 1, 1), ['C']),
      ...[204, 205, 206, 212].map((id) => teamPlayer(skater(id, 20, 20), ['LW', 'RW'])),
      teamPlayer(skater(207, 10, 20), ['D']),
      teamPlayer(skater(208, 10, 20), ['D']),
      teamPlayer(skater(209, 10, 20), ['D']),
      teamPlayer(skater(210, 1, 4), ['D']),
      teamPlayer(skater(211, 0, 0), ['C'], true),
    ],
  };
}

describe('FaScoutComponent', () => {
  let chosen: ChosenLeague | null;
  let freeAgents: ReturnType<typeof vi.fn<() => Observable<ScoutList>>>;
  let myTeam: ReturnType<typeof vi.fn<() => Observable<ScoutTeam>>>;
  let settings: LeagueProjectionSettingsResponse;

  beforeEach(() => {
    chosen = LEAGUE;
    settings = SETTINGS;
    freeAgents = vi.fn(() => of(wire()));
    myTeam = vi.fn(() => of(team()));
    return MockBuilder(FaScoutComponent)
      .mock(FaScoutService, { freeAgents, myTeam })
      .keep(YahooLeaguePicker)
      .mock(YahooConnectReturnService)
      .mock(LeagueChoiceService, {
        get league() {
          return () => chosen;
        },
        on: (platform: string) => (chosen?.platform === platform ? chosen : null),
      } as never)
      .mock(YahooService, {
        leagueProjectionSettings: () => of(settings),
        connectionStatus: () => of({ connected: true }),
        // Two, so that neither is picked for the reader: only a remembered league is read.
        myLeagues: () =>
          of({
            leagues: [
              { leagueKey: LEAGUE.leagueId, name: LEAGUE.name },
              { leagueKey: '465.l.2', name: 'Work League' },
            ],
          }),
      } as never)
      .mock(EspnService, { leagueProjectionSettings: () => of(SETTINGS) });
  });

  async function render() {
    const fixture = MockRender(FaScoutComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('asks for a league before anything else', async () => {
    chosen = null;
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('Select a league above');
    expect(freeAgents).not.toHaveBeenCalled();
  });

  it("reads the chosen league's wire", async () => {
    await render();

    expect(freeAgents).toHaveBeenCalledWith('YAHOO', '465.l.9');
  });

  it('lists the skaters best first on the rest of the season, scored by the league', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const first = page.ranked()[0];
    expect(first.player.playerId).toBe('99');
    // 12 goals at 3 and 40 assists at 2, the league's own weights.
    expect(first.score).toBe(116);
    expect(page.ranked().map((row) => row.line.type)).not.toContain('goalie');
  });

  it('tags the defenceman who has climbed the wire since the preseason line', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const montour = page.ranked().find((row) => row.player.playerId === '99');
    expect(montour?.preseasonRank).toBe(21);
    expect(montour?.rising).toBe(true);
    expect(page.risingCount()).toBe(1);
  });

  it('narrows to the risers alone', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.toggleRisingOnly();
    fixture.detectChanges();

    expect(page.filtered().map((row) => row.player.playerId)).toEqual(['99']);
  });

  it('narrows the skaters to the positions picked', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.togglePosition('D');

    expect(page.filtered().map((row) => row.player.playerId)).toEqual(['99']);
  });

  it('lists the goalies on their own', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.setKind('goalie');

    expect(page.filtered().map((row) => row.player.playerId)).toEqual(['50']);
  });

  it('hands the table a page at a time', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const table = ngMocks.find(fixture, ScoutTableComponent);
    expect(ngMocks.input(table, 'rows')).toHaveLength(SCOUT_PAGE_SIZE - 4);
    expect(page.pageCount()).toBe(1);
    expect(page.rangeText()).toBe('1–21 of 21');
  });

  it('says the season is not under way rather than listing nobody', async () => {
    freeAgents.mockReturnValue(of({ inSeason: false, preseasonAvailable: false, players: [] }));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain("The season isn't under way");
    expect(ngMocks.findAll(fixture, ScoutTableComponent)).toHaveLength(0);
  });

  it('says why nobody can rise when the preseason line is not stored', async () => {
    freeAgents.mockReturnValue(of({ ...wire(), preseasonAvailable: false }));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain(
      "The projection made before the season isn't stored",
    );
  });

  it('offers a retry when the wire cannot be read', async () => {
    freeAgents.mockReturnValue(throwError(() => new Error('502')));
    const fixture = await render();

    const error = ngMocks
      .findAll(fixture, ErrorStateComponent)
      .find((element) => ngMocks.input(element, 'title') === "Couldn't load free agents");
    expect(error).toBeDefined();
  });

  it("reads the user's own team in the same league", async () => {
    await render();

    expect(myTeam).toHaveBeenCalledWith('YAHOO', '465.l.9');
  });

  it('suggests the lowest scorers to drop, leaving injured reserve out', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.candidates().map((candidate) => candidate.row.player.playerId)).toEqual([
      '203',
      '202',
      '210',
    ]);
    expect(page.keptOut().reserve).toBe(1);
    const text = ngMocks.formatText(fixture);
    expect(text).toContain('Skaters to drop from Slapshots');
    expect(text).toContain('1 on injured reserve left out.');
  });

  it('says which drops a pickup must play the same position to make', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const [utilC, , lastD] = page.candidates();
    // The weakest C starts at Util, which any skater can fill.
    expect(page.needsText(utilC)).toBe('Any pickup');
    expect(page.needsText(lastD)).toBe('Only for a D');
  });

  it('pairs each pickup with the player to drop for him and what the swap gains', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    // The risen defenceman (116) replaces the lowest scorer, the C at Util (5), whose seat he can
    // fill: the same drop as for a forward.
    const montour = page.swaps().get('99');
    expect(montour?.kind === 'drop' && montour.drop.player.playerId).toBe('203');
    expect(montour?.gain).toBe(116 - 5);
    // A depth C beats the spare C too.
    const depth = page.swaps().get('1');
    expect(depth?.kind === 'drop' && depth.drop.player.playerId).toBe('203');
    const table = ngMocks.find(fixture, ScoutTableComponent);
    expect(ngMocks.input(table, 'swaps')).toBe(page.swaps());
  });

  it('narrows to the pickups that beat the player they would replace', async () => {
    myTeam.mockReturnValue(
      of({
        ...team(),
        // Every player at 100: above any depth forward on the wire (70 at most), below the
        // risen defenceman (116).
        players: team().players.map((player) =>
          teamPlayer(
            skater(Number(player.playerId), 20, 20),
            [...player.positions],
            player.reserve,
          ),
        ),
      }),
    );
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.toggleUpgradesOnly();

    expect(page.filtered().map((row) => row.player.playerId)).toEqual(['99']);
  });

  it('keeps the list without drops when the user has no team in the league', async () => {
    myTeam.mockReturnValue(of({ found: false, teamName: null, players: [] }));
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(ngMocks.formatText(fixture)).toContain('You have no team in this league');
    expect(page.ranked()).toHaveLength(21);
    expect(ngMocks.input(ngMocks.find(fixture, ScoutTableComponent), 'swaps')).toBeNull();
  });

  it('keeps the list when the team cannot be read, and offers to try again', async () => {
    myTeam.mockReturnValue(throwError(() => new Error('502')));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain("Couldn't load your team in this league");
    expect(ngMocks.findAll(fixture, ScoutTableComponent)).toHaveLength(1);
  });

  it('moves an injured player to a free IR slot rather than drop anyone', async () => {
    settings = { ...SETTINGS, reserveSlots: { IR: 2 } };
    myTeam.mockReturnValue(
      of({
        ...team(),
        players: [
          ...team().players,
          {
            ...teamPlayer(skater(213, 1, 1, 30), ['D']),
            name: 'Filip Hronek',
            injuryStatus: 'O',
            slot: 'BN',
            out: true,
            reserveEligible: ['IR'],
          },
        ],
      }),
    );
    const fixture = await render();
    const page = fixture.point.componentInstance;

    // One IR slot is taken by the reserve C, the other is free: Hronek goes there.
    expect(page.room().toReserve.map((move) => move.player.name)).toEqual(['Filip Hronek']);
    expect(page.swaps().get('99')).toMatchObject({ kind: 'reserve', gain: 116 });
    expect(page.candidates().map((candidate) => candidate.row.player.name)).not.toContain(
      'Filip Hronek',
    );
    const move = ngMocks.find(fixture, '.room');
    expect(ngMocks.formatText(ngMocks.find(move, 'strong'))).toBe('Filip Hronek');
    expect(ngMocks.formatText(ngMocks.find(move, '.drop-tag'))).toBe('O');
    expect(ngMocks.formatText(move)).toContain('to IR: his roster spot then takes a pickup');
  });

  it('takes an open roster spot without dropping anyone', async () => {
    myTeam.mockReturnValue(
      of({ ...team(), players: team().players.filter((player) => player.playerId !== '203') }),
    );
    const fixture = await render();
    const page = fixture.point.componentInstance;

    // Eleven roster spots against ten players off reserve.
    expect(page.room().openSpots).toBe(1);
    expect(page.swaps().get('99')).toEqual({ kind: 'open', gain: 116 });
    expect(ngMocks.formatText(fixture)).toContain(
      '1 open roster spot: pick up without dropping anyone',
    );
  });
});
