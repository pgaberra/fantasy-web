import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { Projection } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import {
  PlayerScoutService,
  ScoutList,
  ScoutOwner,
  ScoutPlayer,
  ScoutTeamAnswer,
  TeamPlayer,
} from '../services/player-scout.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { DEFAULT_SINCE_DAYS, PlayerScoutComponent, SCOUT_PAGE_SIZE } from './player-scout';
import { ScoutTableComponent } from './scout-table/scout-table';
import { daysBefore, SincePickerComponent } from './since-picker/since-picker';

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

/** Ten nights every club plays: the lineup is the whole question. */
const NIGHTS = Array.from(
  { length: 10 },
  (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`,
);

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
  then: Projection | null,
  positions: string[] = ['C'],
  owner: ScoutOwner | null = null,
): ScoutPlayer {
  return {
    freeAgent: {
      projection: now,
      playerId: String(now.playerId),
      name: `Player ${now.playerId}`,
      teamAbbrev: owner ? 'EDM' : 'SEA',
      positions,
      availability: owner ? 'UNKNOWN' : 'FREE_AGENT',
      clubGames: now.stats.utility.gp,
      expectedGames: now.stats.utility.gp,
      projected: new Set(['goals', 'assists']),
    },
    nhlId: 8400000 + now.playerId,
    type: now.type,
    owner,
    then,
    thenProjected: new Set(then ? ['goals', 'assists'] : []),
    usage: null,
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

const MINE: ScoutOwner = { teamName: 'Slapshots', mine: true };
const THEIRS: ScoutOwner = { teamName: 'Someone Else', mine: false };

/**
 * The user's team against the league's 2 C / 2 LW / 2 RW / 4 D / 1 Util lineup, a full roster:
 * seven forwards for the seven forward and Util seats, exactly four D, and a player on injured
 * reserve who holds no roster spot. Everyone with a seat starts every night.
 */
const TEAM_LINES: readonly [Projection, string[], boolean?][] = [
  [skater(201, 40, 50), ['C']],
  [skater(202, 1, 2), ['C']],
  [skater(203, 1, 1), ['C']],
  ...([204, 205, 206, 212] as const).map(
    (id) => [skater(id, 20, 20), ['LW', 'RW']] as [Projection, string[]],
  ),
  [skater(207, 10, 20), ['D']],
  [skater(208, 10, 20), ['D']],
  [skater(209, 10, 20), ['D']],
  [skater(210, 1, 4), ['D']],
  [skater(211, 0, 0), ['C'], true],
];

function team(): ScoutTeamAnswer {
  return {
    team: {
      found: true,
      teamName: 'Slapshots',
      players: TEAM_LINES.map(([line, positions, reserve]) => teamPlayer(line, positions, reserve)),
    },
    schedule: new Map([
      ['EDM', NIGHTS],
      ['SEA', NIGHTS],
    ]),
  };
}

/**
 * Twenty depth forwards the model rated the same on the day and now, one defenceman who has since
 * taken a top role, a goalie, the user's own players, and one of another team's.
 */
function league(): ScoutList {
  const depth = Array.from({ length: 20 }, (_, index) =>
    scoutPlayer(skater(index + 1, 10, 20 - index * 0.5), skater(index + 1, 10, 20 - index * 0.5)),
  );
  return {
    inSeason: true,
    since: { requested: '2026-10-07', kind: 'SNAPSHOT', resolved: '2026-10-07' },
    players: [
      ...depth,
      scoutPlayer(skater(99, 12, 40), skater(99, 4, 10), ['D']),
      scoutPlayer(goalie(50), goalie(50), ['G']),
      ...TEAM_LINES.map(([line, positions]) => scoutPlayer(line, line, positions, MINE)),
      scoutPlayer(skater(301, 30, 30), skater(301, 35, 35), ['C'], THEIRS),
    ],
  };
}

describe('PlayerScoutComponent', () => {
  let chosen: ChosenLeague | null;
  let players: ReturnType<typeof vi.fn<() => Observable<ScoutList>>>;
  let myTeam: ReturnType<typeof vi.fn<() => Observable<ScoutTeamAnswer>>>;
  let settings: LeagueProjectionSettingsResponse;

  beforeEach(() => {
    chosen = LEAGUE;
    settings = SETTINGS;
    players = vi.fn(() => of(league()));
    myTeam = vi.fn(() => of(team()));
    return MockBuilder(PlayerScoutComponent)
      .mock(PlayerScoutService, { players, myTeam })
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
    const fixture = MockRender(PlayerScoutComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const ids = (rows: readonly { player: { playerId: string } }[]) =>
    rows.map((row) => row.player.playerId);

  it('asks for a league before anything else', async () => {
    chosen = null;
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('Select a league above');
    expect(players).not.toHaveBeenCalled();
  });

  it("reads the chosen league's players since a week ago, and again for another day", async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(players).toHaveBeenCalledWith(
      'YAHOO',
      '465.l.9',
      daysBefore(page.today, DEFAULT_SINCE_DAYS),
    );

    page.since.set(null);
    await fixture.whenStable();

    expect(players).toHaveBeenLastCalledWith('YAHOO', '465.l.9', null);
  });

  it('ranks everyone in the league best first on the rest of the season, scored by the league', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.ranked()[0].player.playerId).toBe('201');
    const montour = page.ranked().find((row) => row.player.playerId === '99');
    // 12 goals at 3 and 40 assists at 2, the league's own weights, and his place among everyone.
    expect(montour?.score).toBe(116);
    expect(montour?.rank).toBe(3);
    // The league scores no goalie stat, so the goalie scores nothing, with the empty line on IR.
    const goalie = page.ranked().find((row) => row.player.playerId === '50');
    expect(goalie?.score).toBe(0);
    expect(
      page
        .ranked()
        .slice(-2)
        .map((row) => row.score),
    ).toEqual([0, 0]);
  });

  it('opens on the available players, the biggest rise in score first', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.pool()).toBe('available');
    expect(page.sort()).toEqual({ key: 'delta', descending: true });
    expect(ids(page.sorted())[0]).toBe('99');
    expect(page.sorted()[0].delta).toBe(116 - 32);
    expect(ids(page.filtered())).not.toContain('201');
    expect(ids(page.filtered())).not.toContain('301');
  });

  it('tags the defenceman who has climbed since the day', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const montour = page.ranked().find((row) => row.player.playerId === '99');
    expect(montour?.rising).toBe(true);
    expect(page.risingCount()).toBe(1);
  });

  it("shows the user's own players, or everyone, on the switch", async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.pool.set('mine');
    expect(page.filtered()).toHaveLength(12);
    expect(page.filtered().every((row) => row.scout.owner?.mine)).toBe(true);

    page.pool.set('all');
    expect(page.filtered()).toHaveLength(35);
    expect(ids(page.filtered())).toContain('301');
  });

  it('narrows to the risers, or the fallers', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.movers.set('risers');
    expect(ids(page.filtered())).toEqual(['99']);

    page.pool.set('all');
    page.movers.set('fallers');
    expect(ids(page.filtered())).toEqual(['301']);
  });

  it('narrows the list to the positions picked, and finds a name', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.togglePosition('D');
    expect(ids(page.filtered())).toEqual(['99']);

    page.clearPositions();
    page.togglePosition('G');
    expect(ids(page.filtered())).toEqual(['50']);

    page.clearPositions();
    page.search.set('player 1');
    expect(ids(page.filtered())).toEqual([
      '1',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
    ]);
  });

  it('picks the four skater positions with All skaters, and goes back to everyone', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.toggleAllSkaters();
    fixture.detectChanges();

    expect(page.allSkaters()).toBe(true);
    expect(page.filtered()).toHaveLength(21);
    expect(ngMocks.formatText(ngMocks.find(fixture, '.roster-toggle'))).toBe('Your skaters (12)');

    page.toggleAllSkaters();
    expect(page.positions().size).toBe(0);
    expect(page.filtered()).toHaveLength(22);
  });

  it('hands the table a page at a time, saying who holds whom only for everyone', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const table = ngMocks.find(fixture, ScoutTableComponent);
    expect(ngMocks.input(table, 'rows')).toHaveLength(22);
    expect(ngMocks.input(table, 'showOwner')).toBe(false);
    expect(ngMocks.input(table, 'sinceLabel')).toBe('vs 7 Oct');
    expect(page.rangeText()).toBe('1–22 of 22');

    page.pool.set('all');
    fixture.detectChanges();
    expect(ngMocks.input(table, 'rows')).toHaveLength(SCOUT_PAGE_SIZE);
    expect(ngMocks.input(table, 'showOwner')).toBe(true);
    expect(page.pageCount()).toBe(2);
  });

  it('sorts the whole list by a column before paging it', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.sortBy('rise');
    page.sortBy('rise');
    fixture.detectChanges();

    expect(page.sort()).toEqual({ key: 'rise', descending: false });
    const rises = page.sorted().flatMap((row) => (row.rise === null ? [] : [row.rise]));
    expect(rises).toEqual([...rises].sort((first, second) => first - second));
    const table = ngMocks.find(fixture, ScoutTableComponent);
    expect(ngMocks.input(table, 'sort')).toEqual({ key: 'rise', descending: false });
  });

  it('falls back to the movers order when the column sorted by leaves the table', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    page.sortBy('toi');
    page.togglePosition('G');

    expect(page.sort()).toEqual({ key: 'delta', descending: true });
  });

  it('says the season is not under way rather than listing nobody', async () => {
    players.mockReturnValue(of({ inSeason: false, since: { kind: 'NONE' }, players: [] }));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain("The season isn't under way");
    expect(ngMocks.findAll(fixture, ScoutTableComponent)).toHaveLength(0);
  });

  it('offers a retry when the players cannot be read', async () => {
    players.mockReturnValue(throwError(() => new Error('502')));
    const fixture = await render();

    const error = ngMocks
      .findAll(fixture, ErrorStateComponent)
      .find((element) => ngMocks.input(element, 'title') === "Couldn't load the players");
    expect(error).toBeDefined();
  });

  it("reads the user's own team in the same league", async () => {
    await render();

    expect(myTeam).toHaveBeenCalledWith('YAHOO', '465.l.9');
  });

  it('opens on the list, with the roster folded under a line naming the cheapest drop', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.rosterOpen()).toBe(false);
    // Everyone with a seat starts every night, so the cheapest is the lowest scorer who holds a
    // spot: the C on injured reserve scores lowest but holds none.
    expect(page.cheapest()?.player.playerId).toBe('203');
    expect(page.valuation()?.byPlayer.get('203')?.starts).toBe(10);
    const floor = ngMocks.find(fixture, '.floor');
    expect(ngMocks.formatText(floor)).toContain('Full roster.');
    expect(ngMocks.formatText(ngMocks.find(floor, 'strong'))).toBe('Mine 203');
    expect(ngMocks.formatText(ngMocks.find(floor, '.floor-score'))).toBe('costs 5.0');
    const toggle = ngMocks.find(fixture, '.roster-toggle');
    expect(ngMocks.formatText(toggle)).toBe('Your players (12)');
    expect(toggle.attributes['aria-expanded']).toBe('false');
  });

  it('unfolds the roster, the cheapest to drop first, with his starts and what the lineup loses', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    ngMocks.click(ngMocks.find(fixture, '.roster-toggle'));
    fixture.detectChanges();

    expect(ngMocks.find(fixture, '.roster-toggle').attributes['aria-expanded']).toBe('true');
    const order = page.roster().map((entry) => entry.player.playerId);
    expect(order[0]).toBe('203');
    expect(order.at(-1)).toBe('211');
    const rows = ngMocks.findAll(fixture, '.roster-table tbody tr');
    expect(rows).toHaveLength(12);
    expect(ngMocks.formatText(rows[0])).toContain('10 / 10');
    expect(rows[0].nativeElement.classList).toContain('roster-row--cheapest');
    expect(ngMocks.formatText(ngMocks.find(fixture, '.roster-caption'))).toContain(
      'Slapshots, the cheapest to drop first.',
    );
  });

  it('names the player whose going costs the lineup least, not the lowest scorer', async () => {
    // Two centre seats and one defence seat: the third centre starts nowhere, so he costs
    // nothing to drop, though he outscores the lone defenceman, who starts every night.
    settings = {
      ...SETTINGS,
      rosterSlots: { c: 2, lw: 0, rw: 0, w: 0, f: 0, d: 1, g: 0, util: 0, bn: 1 },
    };
    const lines: [Projection, string[]][] = [
      [skater(401, 20, 20), ['C']],
      [skater(402, 16, 16), ['C']],
      [skater(403, 12, 12), ['C']],
      [skater(404, 4, 4), ['D']],
    ];
    myTeam.mockReturnValue(
      of({
        team: {
          found: true,
          teamName: 'Slapshots',
          players: lines.map(([line, positions]) => teamPlayer(line, positions)),
        },
        schedule: new Map([
          ['EDM', NIGHTS],
          ['SEA', NIGHTS],
        ]),
      }),
    );
    players.mockReturnValue(
      of({
        ...league(),
        players: [
          scoutPlayer(skater(99, 10, 10), skater(99, 4, 4), ['D']),
          scoutPlayer(skater(98, 14, 14), skater(98, 4, 4), ['C']),
          ...lines.map(([line, positions]) => scoutPlayer(line, line, positions, MINE)),
        ],
      }),
    );
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.cheapest()?.player.playerId).toBe('403');
    expect(page.valuation()?.byPlayer.get('403')?.marginal).toBe(0);
    expect(page.valuation()?.byPlayer.get('404')?.marginal).toBe(20);
    // The available D replaces the lone D for a gain; the available C cannot start, so his best
    // swap, the benched centre, gains nothing.
    const swap = (id: string) => {
      const found = page.swaps()?.get(id);
      return found?.kind === 'drop' ? { drop: found.drop.playerId, gain: found.gain } : found;
    };
    expect(swap('99')).toEqual({ drop: '404', gain: 30 });
    expect(swap('98')).toEqual({ drop: '403', gain: 0 });
  });

  it('weighs no swaps while the team is not his, and none for his own players', async () => {
    myTeam.mockReturnValue(
      of({ team: { found: false, teamName: null, players: [] }, schedule: new Map() }),
    );
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.teamStatus()).toBe('not-found');
    expect(page.swaps()).toBeNull();
    expect(ngMocks.formatText(fixture)).toContain('You have no team in this league');
  });

  it('keeps the list when the team cannot be read, and offers to try again', async () => {
    myTeam.mockReturnValue(throwError(() => new Error('424')));
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.teamStatus()).toBe('error');
    expect(ngMocks.findAll(fixture, ScoutTableComponent)).toHaveLength(1);
    expect(ngMocks.formatText(fixture)).toContain("Couldn't load your team");
  });

  it('says why nobody has a then-line when no earlier line is stored', async () => {
    players.mockReturnValue(
      of({
        ...league(),
        since: { kind: 'NONE' },
        players: league().players.map((player) => ({ ...player, then: null })),
      }),
    );
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.sinceLabel()).toBe('no earlier line');
    expect(page.sinceAnswer()?.kind).toBe('NONE');
    expect(ngMocks.input(ngMocks.find(fixture, SincePickerComponent), 'answer')).toEqual({
      kind: 'NONE',
    });
  });
});
