import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api/api';
import { startBenchMyTeam } from '../api/fn/start-bench/start-bench-my-team';
import { startBenchRestOfSeason } from '../api/fn/start-bench/start-bench-rest-of-season';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { PlannerMyTeamResponse } from '../api/models/planner-my-team-response';
import { ScheduleStrengthResponse } from '../api/models/schedule-strength-response';
import { EspnService } from '../services/espn.service';
import { ChosenLeague, LeagueChoiceService } from '../services/league-choice.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { YahooService } from '../services/yahoo.service';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { PLANNER_TODAY } from '../streamer-planner/planner-schedule';
import { START_BENCH_DAYS_AHEAD, StartBenchComponent } from './start-bench';

const LEAGUE: ChosenLeague = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };
const TODAY = '2026-10-13';

const SETTINGS: LeagueProjectionSettingsResponse = {
  leagueName: 'The Gordie Howes',
  scoringType: 'points',
  statWeights: { goals: 3, assists: 2 },
  activeScoringColumns: ['goals', 'assists'],
  activeUtilityColumns: ['gp'],
  // One centre seat and nothing else, so two centres with a game are one too many.
  rosterSlots: { c: 1, lw: 0, rw: 0, w: 0, f: 0, d: 0, g: 0, util: 0, bn: 3 },
  leagueSize: 12,
  unsupportedRosterCodes: [],
  unsupportedStats: [],
};

/** In the lineup a centre the model rates below the one on the bench, and a third with no game. */
function team(): PlannerMyTeamResponse {
  const centre = (playerId: string, slot: string, teamAbbrev: string) => ({
    playerId,
    name: `Centre ${playerId}`,
    teamAbbrev,
    type: 'skater',
    positions: ['C'],
    slot,
    out: false,
  });
  return {
    found: true,
    teamName: 'Slapshots',
    players: [centre('1', 'C', 'EDM'), centre('2', 'BN', 'TOR'), centre('3', 'BN', 'BOS')],
    lines: [
      {
        playerId: '1',
        clubGames: 1,
        expectedGames: 1,
        stats: { goals: 0.2, assists: 0.3 },
        nights: [],
      },
      {
        playerId: '2',
        clubGames: 1,
        expectedGames: 1,
        stats: { goals: 0.5, assists: 0.6 },
        nights: [],
      },
      {
        playerId: '3',
        clubGames: 0,
        expectedGames: 0,
        stats: { goals: 0, assists: 0 },
        nights: [],
      },
    ],
  };
}

function schedule(date: string): ScheduleStrengthResponse {
  const game = (opponent: string, home: boolean) => ({
    backToBack: false,
    date,
    goalieWorth: 1,
    home,
    offNight: false,
    opponent,
    opponentGoalsAgainst: 3,
    opponentGoalsFor: 3,
    plusMinusPerMinute: 0,
    skaterWorth: 1,
    statWorth: {},
  });
  const club = (abbrev: string, games: ReturnType<typeof game>[]) => ({
    backToBacks: 0,
    games: games.length,
    goalieRank: 1,
    goalieScore: 1,
    homeGames: 0,
    offNightGames: 0,
    schedule: games,
    skaterRank: 1,
    skaterScore: 1,
    team: abbrev,
  });
  return {
    start: date,
    end: date,
    nights: [],
    offNightMaxGames: 5,
    teams: [club('EDM', [game('CGY', true)]), club('TOR', [game('MTL', false)]), club('BOS', [])],
  };
}

describe('StartBenchComponent', () => {
  let chosen: ChosenLeague | null;
  let myTeam: PlannerMyTeamResponse;
  const invoke = vi.fn();

  beforeEach(() => {
    chosen = LEAGUE;
    myTeam = team();
    invoke.mockReset();
    invoke.mockImplementation((fn: unknown, params?: { start: string }) => {
      if (fn === startBenchRestOfSeason) {
        return Promise.resolve({ found: false, players: [] });
      }
      if (fn === startBenchMyTeam) {
        return Promise.resolve(myTeam);
      }
      if (fn === streamerPlannerTeams && params) {
        return Promise.resolve(schedule(params.start));
      }
      return Promise.reject(new Error('unexpected call'));
    });
    return MockBuilder(StartBenchComponent)
      .provide({ provide: Api, useValue: { invoke } })
      .provide({ provide: PLANNER_TODAY, useValue: () => TODAY })
      .keep(YahooLeaguePicker)
      .mock(YahooConnectReturnService)
      .mock(LeagueChoiceService, {
        get league() {
          return () => chosen;
        },
        on: (platform: string) => (chosen?.platform === platform ? chosen : null),
      } as never)
      .mock(YahooService, {
        leagueProjectionSettings: () => of(SETTINGS),
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
    const fixture = MockRender(StartBenchComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('asks for a league before reading anything', async () => {
    chosen = null;
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('Select a league above');
    expect(invoke).not.toHaveBeenCalled();
  });

  it("opens on today's games and reads the lineup as set for today", async () => {
    const fixture = await render();

    expect(invoke).toHaveBeenCalledWith(startBenchMyTeam, {
      platform: 'YAHOO',
      leagueId: '465.l.9',
      date: TODAY,
    });
    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, { start: TODAY, end: TODAY });
    expect(ngMocks.formatText(fixture)).toContain('Today,');
  });

  it('starts the centre the model rates higher and benches the other', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    const day = page.day();
    expect(day?.starts.map((row) => row.player.playerId)).toEqual(['2']);
    expect(day?.benches.map((row) => row.player.playerId)).toEqual(['1']);
    // 0.5 goals at 3 and 0.6 assists at 2 in for 0.2 and 0.3: 2.7 against 1.2.
    expect(page.gainText()).toBe('+1.5 projected fantasy points');
    const text = ngMocks.formatText(fixture);
    expect(text).toContain('Start Centre 2.');
    expect(text).toContain('Bench Centre 1.');
    expect(text).toContain('@ MTL');
    expect(text).toContain('No game');
  });

  it('lists the lineup as it stands now: the starter first, then the bench', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.rows().map((row) => row.player.playerId)).toEqual(['1', '2', '3']);
  });

  it('says so when the lineup is already the best one', async () => {
    myTeam = {
      ...team(),
      players: team().players.map((player) => ({
        ...player,
        slot: player.playerId === '2' ? 'C' : 'BN',
      })),
    };
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('already the best one');
  });

  it('steps to the next day and reads that day’s lineup, never before today', async () => {
    const fixture = await render();
    const page = fixture.point.componentInstance;

    expect(page.canGoBack()).toBe(false);
    page.step(1);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(invoke).toHaveBeenCalledWith(startBenchMyTeam, {
      platform: 'YAHOO',
      leagueId: '465.l.9',
      date: '2026-10-14',
    });
    expect(page.isToday()).toBe(false);
    page.pickDate('2026-01-01');
    expect(page.date()).toBe(TODAY);
    page.pickDate('2027-12-31');
    expect(page.date()).toBe(page.lastDay);
    expect(START_BENCH_DAYS_AHEAD).toBe(30);
    expect(page.lastDay).toBe('2026-11-12');
  });

  it('activates a centre cleared to come off injured reserve when he is the better start', async () => {
    const base = team();
    myTeam = {
      ...base,
      players: base.players.map((player) =>
        player.playerId === '2'
          ? { ...player, slot: 'IR+', out: true, injuryStatus: undefined }
          : player,
      ),
    };
    const fixture = await render();

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('Activate Centre 2 from injured reserve first.');
    expect(text).toContain('Expected back');
    expect(text).toContain('That takes a roster spot');
  });

  it('never activates a player the platform still names an injury for, whatever the model says', async () => {
    const base = team();
    myTeam = {
      ...base,
      players: base.players.map((player) =>
        player.playerId === '2' ? { ...player, slot: 'IR', out: true, injuryStatus: 'O' } : player,
      ),
    };
    const fixture = await render();

    const text = ngMocks.formatText(fixture);
    expect(text).not.toContain('Activate');
    expect(text).not.toContain('Expected back');
  });

  it('names a goalie his club has confirmed rather than give a bare chance', async () => {
    const base = team();
    myTeam = {
      ...base,
      players: [
        ...base.players,
        {
          playerId: '9',
          name: 'Tonight Starter',
          teamAbbrev: 'EDM',
          type: 'goalie',
          positions: ['G'],
          slot: 'BN',
          out: false,
        },
      ],
      lines: [
        ...base.lines,
        {
          playerId: '9',
          clubGames: 1,
          expectedGames: 1,
          stats: { w: 0.6 },
          nights: [{ date: TODAY, share: 1, starter: 'confirmed' }],
        },
      ],
    };
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('Confirmed starter');
  });

  it('says so when the league holds no team of the user’s', async () => {
    myTeam = { found: false, players: [], lines: [] };
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('You have no team in this league');
  });
});
