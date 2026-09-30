import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Api } from '../api/api';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { streamerPlannerWeeks } from '../api/fn/streamer-planner/streamer-planner-weeks';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { PlannerWeeksResponse } from '../api/models/planner-weeks-response';
import { ScheduleStrengthResponse } from '../api/models/schedule-strength-response';
import { TeamSchedule } from '../api/models/team-schedule';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import {
  FreeAgentWeek,
  StreamerPlannerFreeAgentsService,
} from '../services/streamer-planner-free-agents.service';
import {
  PlannerLeague,
  StreamerPlannerLeagueService,
} from '../services/streamer-planner-league.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { StreamerPlannerComponent } from './streamer-planner';

const WEEKS: PlannerWeeksResponse = {
  season: 2026,
  currentWeek: 2,
  weeks: [
    { week: 1, start: '2026-10-07', end: '2026-10-11', games: 30 },
    { week: 2, start: '2026-10-12', end: '2026-10-18', games: 50 },
    { week: 3, start: '2026-10-19', end: '2026-10-25', games: 50 },
    { week: 4, start: '2026-10-26', end: '2026-11-01', games: 50 },
    { week: 5, start: '2026-11-02', end: '2026-11-08', games: 50 },
    { week: 6, start: '2026-11-09', end: '2026-11-15', games: 50 },
  ],
};

function team(name: string, skaterRank: number, goalieRank: number): TeamSchedule {
  return {
    team: name,
    games: 2,
    offNightGames: 1,
    backToBacks: 0,
    homeGames: 1,
    skaterScore: 2.3,
    skaterRank,
    goalieScore: 2.2,
    goalieRank,
    schedule: [
      {
        date: '2026-10-13',
        opponent: 'SJS',
        home: false,
        offNight: true,
        backToBack: true,
        opponentGoalsAgainst: 1.12,
        opponentGoalsFor: 1.08,
      },
      {
        date: '2026-10-15',
        opponent: 'CGY',
        home: true,
        offNight: false,
        backToBack: false,
        opponentGoalsAgainst: 0.9,
        opponentGoalsFor: 1.0,
      },
    ],
  };
}

function strength(start: string, end: string): ScheduleStrengthResponse {
  return {
    season: 2026,
    start,
    end,
    offNightMaxGames: 7,
    nights: [
      { date: '2026-10-13', games: 3, offNight: true },
      { date: '2026-10-15', games: 9, offNight: false },
    ],
    teams: [team('EDM', 1, 2), team('TBL', 2, 1)],
  };
}

const LEAGUE: PlannerLeague = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };

/** A points league that pays 3 for a goal, 2 for an assist and nothing else. */
const SETTINGS: LeagueProjectionSettingsResponse = {
  leagueName: 'The Gordie Howes',
  scoringType: 'points',
  statWeights: { goals: 3, assists: 2 },
  activeScoringColumns: ['goals', 'assists'],
  activeUtilityColumns: ['gp'],
  rosterSlots: { c: 2, lw: 2, rw: 2, w: 0, f: 0, d: 4, g: 2, util: 1, bn: 4 },
  leagueSize: 12,
  unsupportedRosterCodes: [],
  unsupportedStats: [],
};

function scoringLine<K extends string>(keys: readonly K[], set: Record<string, number>) {
  return keys.reduce(
    (line, key) => ({ ...line, [key]: set[key] ?? 0 }),
    {} as Record<K, number>,
  ) as never;
}

function skater(
  playerId: string,
  name: string,
  goals: number,
  assists: number,
  team = 'EDM',
  positions = ['C'],
): FreeAgentWeek['players'][number] {
  return {
    playerId,
    name,
    teamAbbrev: team,
    positions,
    availability: 'FREE_AGENT',
    clubGames: 2,
    expectedGames: 2,
    projection: {
      type: 'skater',
      playerId: Number(playerId),
      stats: {
        scoring: scoringLine(SKATER_SCORING_STAT_KEYS, { goals, assists, points: goals + assists }),
        utility: { gp: 2, toiPerGame: 1100 },
      },
    },
  };
}

function goalie(playerId: string, name: string, wins: number): FreeAgentWeek['players'][number] {
  return {
    playerId,
    name,
    teamAbbrev: 'TB',
    positions: ['G'],
    availability: 'WAIVERS',
    clubGames: 2,
    expectedGames: 1.5,
    projection: {
      type: 'goalie',
      playerId: Number(playerId),
      stats: {
        scoring: scoringLine(GOALIE_SCORING_STAT_KEYS, { w: wins, sv: 57, svPct: 0.908 }),
        utility: { gp: 1.5 },
      },
    },
  };
}

describe('StreamerPlannerComponent', () => {
  const invoke = vi.fn();
  const freeAgents = vi.fn();
  let chosen: PlannerLeague | null = null;

  beforeEach(() => {
    chosen = null;
    invoke.mockReset();
    freeAgents.mockReset();
    invoke.mockImplementation((fn: unknown, params?: { start: string; end: string }) => {
      if (fn === streamerPlannerWeeks) {
        return Promise.resolve(WEEKS);
      }
      if (fn === streamerPlannerTeams && params) {
        return Promise.resolve(strength(params.start, params.end));
      }
      return Promise.reject(new Error('unexpected call'));
    });
    freeAgents.mockReturnValue(
      of<FreeAgentWeek>({
        players: [
          skater('1', 'Second Best', 1, 1),
          skater('2', 'Top Scorer', 3, 1, 'EDM', ['C', 'LW']),
          goalie('3', 'Waiver Goalie', 1),
        ],
        unprojected: 4,
      }),
    );
    return MockBuilder(StreamerPlannerComponent)
      .provide({ provide: Api, useValue: { invoke } })
      .mock(StreamerPlannerFreeAgentsService, { freeAgents })
      .mock(StreamerPlannerLeagueService, {
        get league() {
          return () => chosen;
        },
      } as never)
      .mock(YahooService, { leagueProjectionSettings: () => of(SETTINGS) })
      .mock(EspnService, { leagueProjectionSettings: () => of(SETTINGS) });
  });

  async function render() {
    const fixture = MockRender(StreamerPlannerComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('opens on the week the server says today falls in, with every night of it', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-12',
      end: '2026-10-18',
    });
    expect(planner.days().map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(planner.days()[1]).toEqual({ date: '2026-10-13', games: 3, offNight: true });
    expect(planner.weeksTitle()).toBe('Week 2');
    expect(planner.nightsTitle()).toBe('2 of 2');
    expect(planner.leagueTitle()).toBe('Not chosen');
  });

  it('spans the weeks from the starting one to the ending one and asks for their dates', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.selectEndWeek({ target: { value: '4' } } as unknown as Event);
    await fixture.whenStable();

    expect(planner.weeksTitle()).toBe('Weeks 2 to 4');
    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-12',
      end: '2026-11-01',
    });
  });

  it('offers only ending weeks the server would rate, and falls back when the start moves past the end', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    expect(planner.endOptions().map((week) => week.week)).toEqual([2, 3, 4, 5]);

    planner.selectEndWeek({ target: { value: '3' } } as unknown as Event);
    planner.selectStartWeek({ target: { value: '5' } } as unknown as Event);

    expect(planner.endWeek()?.week).toBe(5);
    expect(planner.endOptions().map((week) => week.week)).toEqual([5, 6]);
  });

  it("ranks by the server's goalie rank when goalies are picked", async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;
    expect(planner.teamRows().map((row) => row.team)).toEqual(['EDM', 'TBL']);

    planner.selectPosition({ target: { value: 'goalies' } } as unknown as Event);
    expect(planner.teamRows().map((row) => row.team)).toEqual(['TBL', 'EDM']);
  });

  it('re-rates the teams over the nights left when one is unticked, and forgets that on a new interval', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.toggleDay(planner.days()[1]);

    expect(planner.nightsTitle()).toBe('1 of 2');
    // Only the Oct 15 game is left: 1 game against a 0.9 opponent, for both teams alike.
    expect(planner.teamRows().map((row) => [row.team, row.score, row.games])).toEqual([
      ['EDM', 0.9, 1],
      ['TBL', 0.9, 1],
    ]);

    planner.selectEndWeek({ target: { value: '3' } } as unknown as Event);
    await fixture.whenStable();
    expect(planner.everyNightCounted()).toBe(true);
  });

  it('renders a night per day with its games, and a row per team', async () => {
    const fixture = await render();

    const nights = ngMocks.findAll(fixture, '.day');
    expect(nights.length).toBe(7);
    expect(ngMocks.formatText(nights[1])).toContain('3 games');
    expect(ngMocks.formatText(nights[0])).toContain('No games');
    expect(ngMocks.formatText(fixture)).toContain('Week 2');
  });

  it('says so when no schedule is published', async () => {
    invoke.mockImplementation(() => Promise.resolve({ weeks: [] }));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain("hasn't published this season's schedule");
  });

  describe('with a league chosen', () => {
    beforeEach(() => {
      chosen = LEAGUE;
    });

    it("ranks the free agents by the league's own scoring, not by the raw stat line", async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      expect(freeAgents).toHaveBeenCalledWith('YAHOO', '465.l.9', '2026-10-12', '2026-10-18');
      // 3 goals and an assist pays 11; one of each pays 5. Order follows the money.
      expect(planner.ranked().map((row) => row.player.name)).toEqual([
        'Top Scorer',
        'Second Best',
        'Waiver Goalie',
      ]);
      expect(planner.ranked()[0].score).toBeCloseTo(11, 5);
      expect(planner.scoringType()).toBe('points');
      expect(planner.leagueTitle()).toBe('The Gordie Howes');
    });

    it('cards the best three and groups the rest by position, the two-way forward under both', async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      expect(planner.topOptions().map((row) => row.rank)).toEqual([1, 2, 3]);
      expect(planner.groups().map((group) => group.position)).toEqual(['C', 'LW', 'G']);
      expect(planner.groups()[1].rows.map((row) => row.player.name)).toEqual(['Top Scorer']);

      planner.selectPerPosition({ target: { value: '5' } } as unknown as Event);
      expect(planner.perPosition()).toBe(5);
      expect(ngMocks.findAll(fixture, '.option-card').length).toBe(3);
    });

    it("scales a free agent's line to the share of his club's games on the nights counted", async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      // EDM plays Oct 13 and Oct 15; leaving Oct 13 out halves every Oilers' line.
      planner.toggleDay(planner.days()[1]);

      const top = planner.ranked()[0];
      expect(top.player.name).toBe('Top Scorer');
      expect(top.score).toBeCloseTo(5.5, 5);
      expect(top.games).toBe(1);
      // The Lightning goalie's club is spelt TB by the platform and TBL by the NHL.
      const waiver = planner.ranked().find((row) => row.player.name === 'Waiver Goalie');
      expect(waiver?.games).toBeCloseTo(0.75, 5);
    });

    it('says how many available players the model does not project', async () => {
      const fixture = await render();
      expect(ngMocks.formatText(fixture)).toContain('4 available players have no projection');
    });

    it('surfaces a failed read instead of an empty table', async () => {
      freeAgents.mockReturnValue(throwError(() => new Error('offline')));
      const fixture = await render();

      const errorState = ngMocks
        .findAll(fixture, ErrorStateComponent)
        .find((element) => ngMocks.input(element, 'title') === "Couldn't load free agents");
      expect(errorState).toBeDefined();
      expect(fixture.point.componentInstance.ranked()).toHaveLength(0);
    });
  });
});
