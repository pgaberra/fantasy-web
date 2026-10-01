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
import { PLANNER_TODAY } from './planner-schedule';
import { StreamerPlannerComponent } from './streamer-planner';
import { TopOptionsComponent } from './top-options/top-options';

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
        skaterWorth: 1.351,
        goalieWorth: 1.1172,
      },
      {
        date: '2026-10-15',
        opponent: 'CGY',
        home: true,
        offNight: false,
        backToBack: false,
        opponentGoalsAgainst: 0.9,
        opponentGoalsFor: 1.0,
        skaterWorth: 0.9324,
        goalieWorth: 1.0363,
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
    projected: new Set(['goals', 'assists', 'points']),
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

/** A skater in a category league, with whatever line the test needs. */
function lineSkater(
  playerId: string,
  name: string,
  line: Record<string, number>,
): FreeAgentWeek['players'][number] {
  const player = skater(playerId, name, 0, 0);
  return {
    ...player,
    projected: new Set(Object.keys(line)),
    projection: {
      ...player.projection,
      stats: {
        scoring: scoringLine(SKATER_SCORING_STAT_KEYS, line),
        utility: { gp: 2, toiPerGame: 1100 },
      },
    } as never,
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
    projected: new Set(['w', 'sv', 'svPct']),
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

function dateInput(value: string): Event {
  return { target: { value } } as unknown as Event;
}

describe('StreamerPlannerComponent', () => {
  const invoke = vi.fn();
  const freeAgents = vi.fn();
  let chosen: PlannerLeague | null = null;
  /** The Monday of week 2 unless a test says otherwise. */
  let today = '2026-10-12';
  let settings = SETTINGS;

  beforeEach(() => {
    chosen = null;
    today = '2026-10-12';
    settings = SETTINGS;
    localStorage.clear();
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
      }),
    );
    return MockBuilder(StreamerPlannerComponent)
      .provide({ provide: Api, useValue: { invoke } })
      .provide({ provide: PLANNER_TODAY, useValue: () => today })
      .mock(StreamerPlannerFreeAgentsService, { freeAgents })
      .mock(StreamerPlannerLeagueService, {
        get league() {
          return () => chosen;
        },
      } as never)
      .mock(YahooService, { leagueProjectionSettings: () => of(settings) })
      .mock(EspnService, { leagueProjectionSettings: () => of(settings) });
  });

  async function render() {
    const fixture = MockRender(StreamerPlannerComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('opens on the rest of this week, with every night of it', async () => {
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
    expect(planner.activePreset()).toBe('this-week');
    expect(planner.weeksTitle()).toBe('Week 2');
    expect(planner.stretchTitle()).toBe('Oct 12 to Oct 18');
    expect(planner.nightsTitle()).toBe('2 of 2 nights');
    expect(planner.leadingDays()).toEqual([]);
    // Monday has no days before it, so nothing is asked for them.
    expect(invoke.mock.calls.filter(([fn]) => fn === streamerPlannerTeams)).toHaveLength(1);
  });

  // A night already played is not a night to stream for.
  it('starts today rather than on Monday, and draws the days before it as the week they were', async () => {
    today = '2026-10-14';
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-14',
      end: '2026-10-18',
    });
    expect(planner.days().length).toBe(5);
    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-12',
      end: '2026-10-13',
    });
    expect(planner.leadingDays()).toEqual([
      { date: '2026-10-12', games: 0 },
      { date: '2026-10-13', games: 3 },
    ]);
    expect(planner.presets().map((preset) => [preset.key, preset.stretch])).toEqual([
      ['this-week', { start: '2026-10-14', end: '2026-10-18' }],
      ['next-week', { start: '2026-10-19', end: '2026-10-25' }],
      ['two-weeks', { start: '2026-10-14', end: '2026-10-25' }],
    ]);
    const past = ngMocks.findAll(fixture, '.day--past');
    expect(past.length).toBe(2);
    expect(past[0].nativeElement.textContent).toContain('No games');
    expect(past[1].nativeElement.querySelector('.day-count').textContent).toBe('3');
    expect(past[1].nativeElement.querySelector('input')).toBeNull();
    expect(ngMocks.findAll(fixture, 'label.day').length).toBe(5);
  });

  it('moves to next week, or to both weeks, at a word', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.applyPreset('next-week');
    await fixture.whenStable();
    expect(planner.activePreset()).toBe('next-week');
    expect(planner.weeksTitle()).toBe('Week 3');
    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-19',
      end: '2026-10-25',
    });

    planner.applyPreset('two-weeks');
    await fixture.whenStable();
    expect(planner.weeksTitle()).toBe('Weeks 2 to 3');
    expect(invoke).toHaveBeenCalledWith(streamerPlannerTeams, {
      start: '2026-10-12',
      end: '2026-10-25',
    });
  });

  it('takes any two dates, held to today, the season and the longest stretch the server rates', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    // The rest of this week and Monday and Tuesday of the next: no preset says that.
    planner.setEnd(dateInput('2026-10-20'));
    expect(planner.stretch()).toEqual({ start: '2026-10-12', end: '2026-10-20' });
    expect(planner.activePreset()).toBeNull();
    expect(planner.weeksTitle()).toBe('Weeks 2 to 3');

    // A start past the end takes the end with it.
    planner.setStart(dateInput('2026-10-21'));
    expect(planner.stretch()).toEqual({ start: '2026-10-21', end: '2026-10-21' });

    // A start in the past is today; an end too far off is the longest stretch.
    planner.setStart(dateInput('2026-10-01'));
    expect(planner.stretch()?.start).toBe('2026-10-12');
    planner.setEnd(dateInput('2026-12-25'));
    expect(planner.stretch()?.end).toBe('2026-11-11');
    expect(planner.latestEnd()).toBe('2026-11-11');

    // Nothing typed, nothing changed; the box is put back to what is on screen.
    const box = { value: 'not a date' };
    planner.setEnd({ target: box } as unknown as Event);
    expect(planner.stretch()?.end).toBe('2026-11-11');
    expect(box.value).toBe('2026-11-11');
  });

  it("ranks by the server's goalie rank when goalies are picked", async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;
    expect(planner.teamRows().map((row) => row.team)).toEqual(['EDM', 'TBL']);

    planner.setPosition('goalies');
    expect(planner.teamRows().map((row) => row.team)).toEqual(['TBL', 'EDM']);
  });

  it('re-rates the teams over the nights left when one is unticked, and forgets that on a new stretch', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.toggleDay(planner.days()[1]);

    expect(planner.nightsTitle()).toBe('1 of 2 nights');
    // Only the Oct 15 game is left, a home game the server put at 0.9324, for both teams alike.
    expect(planner.teamRows().map((row) => [row.team, row.score, row.games])).toEqual([
      ['EDM', 0.93, 1],
      ['TBL', 0.93, 1],
    ]);

    planner.applyPreset('next-week');
    await fixture.whenStable();
    expect(planner.everyNightCounted()).toBe(true);
  });

  it('renders a night per day with its games, and a row per team', async () => {
    const fixture = await render();

    const nights = ngMocks.findAll(fixture, 'label.day');
    expect(nights.length).toBe(7);
    expect(ngMocks.formatText(nights[1])).toContain('3 games');
    expect(ngMocks.formatText(nights[0])).toContain('No games');
    // The off-night is marked with the word on the night itself, read out in full, and the
    // summary says what the short word stands for.
    const marks = ngMocks.findAll(nights[1], '.day-mark');
    expect(marks.length).toEqual(1);
    expect(ngMocks.find(marks[0], '[aria-hidden="true"]').nativeElement.textContent).toEqual('Off');
    expect(ngMocks.find(marks[0], '.sr-only').nativeElement.textContent).toEqual('Off-night');
    expect(ngMocks.findAll(nights[0], '.day-mark').length).toEqual(0);
    const legend = ngMocks.find(fixture, '.range-legend');
    expect(ngMocks.formatText(ngMocks.find(legend, '.day-mark'))).toEqual('Off');
    expect(ngMocks.formatText(legend)).toContain('Off-night');
    expect(ngMocks.formatText(fixture)).toContain('Week 2');
    expect(ngMocks.formatText(fixture)).toContain('Pick a league above');
    expect(fixture.point.componentInstance.showsTopOptions()).toBe(false);
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
      // The table writes each line in the league's categories, in the league's order.
      expect(planner.categories()).toEqual(['goals', 'assists']);
    });

    it('cards the best three over one list that any number of positions narrows', async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      expect(planner.showsTopOptions()).toBe(true);
      expect(planner.topOptions().map((row) => row.rank)).toEqual([1, 2, 3]);
      const names = () => planner.visible().map((row) => row.player.name);
      expect(names()).toEqual(['Top Scorer', 'Second Best', 'Waiver Goalie']);
      expect(ngMocks.formatText(fixture)).toContain('Showing 3 of 3');

      planner.togglePosition('LW');
      expect(names()).toEqual(['Top Scorer']);
      planner.togglePosition('G');
      expect(names()).toEqual(['Top Scorer', 'Waiver Goalie']);
      planner.togglePosition('LW');
      planner.togglePosition('G');
      planner.togglePosition('D');
      fixture.detectChanges();
      expect(ngMocks.formatText(fixture)).toContain('No available player at these positions');
      planner.clearPositions();
      expect(names()).toHaveLength(3);
      fixture.detectChanges();
      const cards = ngMocks.findInstance(TopOptionsComponent);
      expect(cards.rows().map((row) => row.player.name)).toEqual([
        'Top Scorer',
        'Second Best',
        'Waiver Goalie',
      ]);
      expect(cards.scoringType()).toBe('points');
    });

    it('opens on a page of a long list, adds a page a press, and starts over on other positions', async () => {
      freeAgents.mockReturnValue(
        of<FreeAgentWeek>({
          players: Array.from({ length: 60 }, (_, index) =>
            skater(`${index + 1}`, `Skater ${index + 1}`, 60 - index, 0, 'EDM', [
              index % 2 === 0 ? 'C' : 'D',
            ]),
          ),
        }),
      );
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      expect(planner.visible()).toHaveLength(25);
      expect(ngMocks.formatText(fixture)).toContain('Showing 25 of 60');
      expect(ngMocks.formatText(fixture)).toContain('Show 25 more');

      planner.showMore();
      planner.showMore();
      expect(planner.visible()).toHaveLength(60);
      expect(planner.hiddenCount()).toBe(0);

      // Thirty defensemen: the list is another list, so it opens on its first page again.
      planner.togglePosition('D');
      expect(planner.visible()).toHaveLength(25);
      expect(planner.nextPage()).toBe(5);
      // A narrowed list keeps each player's place among all of them.
      expect(planner.visible()[0].rank).toBe(2);

      planner.showAll();
      expect(planner.visible()).toHaveLength(30);
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
      // The line the table writes is the one the score was reached from, not the whole stretch's.
      expect(top.line.stats.scoring).toMatchObject({ goals: 1.5, assists: 0.5 });
      expect(top.player.projection.stats.scoring).toMatchObject({ goals: 3, assists: 1 });
      // The Lightning goalie's club is spelt TB by the platform and TBL by the NHL.
      const waiver = planner.ranked().find((row) => row.player.name === 'Waiver Goalie');
      expect(waiver?.games).toBeCloseTo(0.75, 5);
    });

    it('surfaces a failed read instead of an empty table', async () => {
      freeAgents.mockReturnValue(throwError(() => new Error('offline')));
      const fixture = await render();

      const errorState = ngMocks
        .findAll(fixture, ErrorStateComponent)
        .find((element) => ngMocks.input(element, 'title') === "Couldn't load free agents");
      expect(errorState).toBeDefined();
      expect(fixture.point.componentInstance.ranked()).toHaveLength(0);
      expect(fixture.point.componentInstance.showsTopOptions()).toBe(false);
    });
  });
  describe('in a category league', () => {
    /** Goals, assists, power-play points and shots, with goalie wins. */
    const CATEGORY_SETTINGS: LeagueProjectionSettingsResponse = {
      ...SETTINGS,
      scoringType: 'category',
      statWeights: {},
      activeScoringColumns: ['goals', 'assists', 'ppp', 'sog', 'w'],
    };

    beforeEach(() => {
      chosen = LEAGUE;
      settings = CATEGORY_SETTINGS;
      freeAgents.mockReturnValue(
        of<FreeAgentWeek>({
          players: [
            lineSkater('1', 'Sniper', { goals: 3, assists: 1, ppp: 0, sog: 12 }),
            lineSkater('2', 'Power Play', { goals: 0, assists: 1, ppp: 2, sog: 3 }),
            lineSkater('3', 'Middle', { goals: 1, assists: 1, ppp: 1, sog: 5 }),
            goalie('4', 'Waiver Goalie', 1),
          ],
        }),
      );
    });

    const names = (rows: readonly { player: { name: string } }[]) =>
      rows.map((row) => row.player.name);

    it('offers the skater categories to rank by, and ranks by every category until one is picked', async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      expect(planner.focusOptions().map((option) => option.key)).toEqual([
        'goals',
        'assists',
        'ppp',
        'sog',
      ]);
      expect(planner.focus().size).toBe(0);
      expect(names(planner.ranked())[0]).toBe('Sniper');
      expect(names(planner.ranked())).toContain('Waiver Goalie');
      expect(ngMocks.formatText(fixture)).toContain('All categories');
    });

    it('ranks skaters alone by the categories picked, and goes back to all of them', async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      planner.toggleFocus('ppp');
      expect(names(planner.ranked())).toEqual(['Power Play', 'Middle', 'Sniper']);
      expect(planner.topOptions()[0].player.name).toBe('Power Play');
      expect(planner.focusLabel()).toBe('PPP');

      planner.toggleFocus('sog');
      expect(names(planner.ranked())[0]).not.toBe('Waiver Goalie');
      expect(names(planner.ranked())).not.toContain('Waiver Goalie');

      planner.clearFocus();
      expect(names(planner.ranked())).toContain('Waiver Goalie');
      expect(names(planner.ranked())[0]).toBe('Sniper');
    });

    it('says why goalies are missing while skater categories are picked', async () => {
      const fixture = await render();
      const planner = fixture.point.componentInstance;

      planner.toggleFocus('ppp');
      planner.togglePosition('G');
      fixture.detectChanges();
      expect(planner.goaliesOutOfFocus()).toBe(true);
      expect(ngMocks.formatText(fixture)).toContain("Goalies aren't ranked by skater categories");
    });

    it('remembers the categories for the league until the week is over', async () => {
      const first = await render();
      first.point.componentInstance.toggleFocus('ppp');
      first.destroy();

      // Later the same week: still chasing power-play points.
      today = '2026-10-17';
      const later = await render();
      expect([...later.point.componentInstance.focus()]).toEqual(['ppp']);
      expect(names(later.point.componentInstance.ranked())[0]).toBe('Power Play');
      later.destroy();

      // The Monday after: a new matchup, so every category again.
      today = '2026-10-19';
      const nextWeek = await render();
      expect(nextWeek.point.componentInstance.focus().size).toBe(0);
    });

    it('offers nothing to pick in a points league', async () => {
      settings = SETTINGS;
      const fixture = await render();

      expect(fixture.point.componentInstance.focusOptions()).toEqual([]);
      expect(ngMocks.formatText(fixture)).not.toContain('All categories');
    });
  });
});
