import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api/api';
import { streamerPlannerTeams } from '../api/fn/streamer-planner/streamer-planner-teams';
import { streamerPlannerWeeks } from '../api/fn/streamer-planner/streamer-planner-weeks';
import { PlannerWeeksResponse } from '../api/models/planner-weeks-response';
import { ScheduleStrengthResponse } from '../api/models/schedule-strength-response';
import { TeamSchedule } from '../api/models/team-schedule';
import { StreamerPlannerComponent } from './streamer-planner';

const WEEKS: PlannerWeeksResponse = {
  season: 2026,
  currentWeek: 2,
  weeks: [
    { week: 1, start: '2026-10-07', end: '2026-10-11', games: 30 },
    { week: 2, start: '2026-10-12', end: '2026-10-18', games: 50 },
  ],
};

function team(name: string, skaterRank: number, goalieRank: number): TeamSchedule {
  return {
    team: name,
    games: 1,
    offNightGames: 1,
    backToBacks: 0,
    homeGames: 1,
    skaterScore: 1.3,
    skaterRank,
    goalieScore: 1.2,
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
    ],
  };
}

function strength(start: string, end: string): ScheduleStrengthResponse {
  return {
    season: 2026,
    start,
    end,
    offNightMaxGames: 7,
    nights: [{ date: '2026-10-13', games: 3, offNight: true }],
    teams: [team('EDM', 1, 2), team('CGY', 2, 1)],
  };
}

describe('StreamerPlannerComponent', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation((fn: unknown, params?: { start: string; end: string }) => {
      if (fn === streamerPlannerWeeks) {
        return Promise.resolve(WEEKS);
      }
      if (fn === streamerPlannerTeams && params) {
        return Promise.resolve(strength(params.start, params.end));
      }
      return Promise.reject(new Error('unexpected call'));
    });
    return MockBuilder(StreamerPlannerComponent).provide({ provide: Api, useValue: { invoke } });
  });

  async function render() {
    const fixture = MockRender(StreamerPlannerComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('opens on the week the server says today falls in, with every day of it', async () => {
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
  });

  it('ranks by the goalie rank when goalies are picked', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;
    expect(planner.teams().map((row) => row.team)).toEqual(['EDM', 'CGY']);

    planner.position.set('goalies');
    expect(planner.teams().map((row) => row.team)).toEqual(['CGY', 'EDM']);
  });

  it('steps to the previous week and asks for its dates', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.step(-1);
    await fixture.whenStable();

    expect(planner.week()?.week).toBe(1);
    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-07',
      end: '2026-10-11',
    });
    expect(planner.canGoBack()).toBe(false);
  });

  it('tints a matchup for skaters and goalies from opposite sides', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;
    const game = team('EDM', 1, 1).schedule[0];

    expect(planner.matchupTier(game)).toBe('good');
    expect(planner.matchupLabel(game)).toBe(
      'at SJS. SJS allows 12% more goals than average. Off-night. Back-to-back.',
    );
    planner.position.set('goalies');
    expect(planner.matchupTier(game)).toBe('bad');
  });

  it('renders a row per team with its game in the right day', async () => {
    const fixture = await render();
    const rows = ngMocks.findAll(fixture, 'tbody tr');

    expect(rows.length).toBe(2);
    expect(ngMocks.formatText(rows[0])).toContain('EDM');
    expect(ngMocks.formatText(rows[0])).toContain('@SJS');
  });

  it('says so when no schedule is published', async () => {
    invoke.mockImplementation(() => Promise.resolve({ weeks: [] }));
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain("hasn't published this season's schedule");
  });
});
