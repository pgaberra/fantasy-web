import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';
import { LeaguesResponse } from '../../api/models/leagues-response';
import { EspnService } from '../../services/espn.service';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import {
  FreeAgentWeek,
  StreamerPlannerFreeAgentsService,
} from '../../services/streamer-planner-free-agents.service';
import {
  PlannerLeague,
  StreamerPlannerLeagueService,
} from '../../services/streamer-planner-league.service';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';
import { YahooService } from '../../services/yahoo.service';
import { FreeAgentsComponent } from './free-agents';

const LEAGUE: PlannerLeague = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };

/** A points league that pays 3 for a goal, 2 for an assist and nothing else. */
const SETTINGS: LeagueProjectionSettingsResponse = {
  leagueName: 'The Gordie Howes',
  scoringType: 'points',
  statWeights: { goals: 3, assists: 2 },
  activeScoringColumns: ['goals', 'assists'],
  activeUtilityColumns: ['gp'],
  rosterSlots: { c: 2, lw: 2, rw: 2, d: 4, g: 2, util: 1, bn: 4 },
  leagueSize: 12,
  unsupportedRosterCodes: [],
  unsupportedStats: [],
};

/** The ranking engine works on complete lines, as the real mapping produces. */
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
): FreeAgentWeek['players'][number] {
  return {
    playerId,
    name,
    teamAbbrev: 'EDM',
    positions: ['C'],
    availability: 'FREE_AGENT',
    clubGames: 4,
    expectedGames: 3.8,
    projection: {
      type: 'skater',
      playerId: Number(playerId),
      stats: {
        scoring: scoringLine(SKATER_SCORING_STAT_KEYS, { goals, assists, points: goals + assists }),
        utility: { gp: 3.8, toiPerGame: 1100 },
      },
    },
  };
}

function goalie(playerId: string, name: string, wins: number): FreeAgentWeek['players'][number] {
  return {
    playerId,
    name,
    teamAbbrev: 'CHI',
    positions: ['G'],
    availability: 'WAIVERS',
    clubGames: 3,
    expectedGames: 2.1,
    projection: {
      type: 'goalie',
      playerId: Number(playerId),
      stats: {
        scoring: scoringLine(GOALIE_SCORING_STAT_KEYS, { w: wins, sv: 57, svPct: 0.908 }),
        utility: { gp: 2.1 },
      },
    },
  };
}

describe('FreeAgentsComponent', () => {
  const freeAgents = vi.fn();
  const league = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };
  const choose = vi.fn();
  const myLeagues = vi.fn<() => ReturnType<YahooService['myLeagues']>>();
  let chosen: PlannerLeague | null = LEAGUE;

  beforeEach(() => {
    chosen = LEAGUE;
    freeAgents.mockReset();
    choose.mockReset();
    myLeagues.mockReset();
    freeAgents.mockReturnValue(
      of<FreeAgentWeek>({
        players: [
          skater('1', 'Second Best', 1, 1),
          skater('2', 'Top Scorer', 3, 1),
          goalie('3', 'Waiver Goalie', 1),
        ],
        unprojected: 4,
      }),
    );
    myLeagues.mockReturnValue(
      of<LeaguesResponse>({
        leagues: [{ leagueKey: '465.l.9', name: 'The Gordie Howes' }],
      }),
    );
    return MockBuilder(FreeAgentsComponent)
      .mock(StreamerPlannerFreeAgentsService, { freeAgents })
      .mock(StreamerPlannerLeagueService, {
        get league() {
          return () => chosen;
        },
        choose,
      } as never)
      .mock(YahooService, { myLeagues, leagueProjectionSettings: () => of(SETTINGS) })
      .mock(EspnService, { leagueProjectionSettings: () => of(SETTINGS) });
  });

  async function render() {
    const fixture = MockRender(FreeAgentsComponent, { start: '2026-10-12', end: '2026-10-18' });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it("ranks by the league's own scoring, not by the raw stat line", async () => {
    const fixture = await render();
    const rows = fixture.point.componentInstance.rows();

    // 3 goals and an assist pays 11; one of each pays 5. Order follows the money.
    expect(rows.map((row) => row.player.name)).toEqual([
      'Top Scorer',
      'Second Best',
      'Waiver Goalie',
    ]);
    expect(rows[0].score).toBeCloseTo(11, 5);
    expect(fixture.point.componentInstance.scoringType()).toBe('points');
  });

  it('asks for the week it is given', async () => {
    await render();
    expect(freeAgents).toHaveBeenCalledWith('YAHOO', '465.l.9', '2026-10-12', '2026-10-18');
  });

  it('filters to a position tab', async () => {
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.tab.set('G');
    expect(planner.rows().map((row) => row.player.name)).toEqual(['Waiver Goalie']);
    planner.tab.set('C');
    expect(planner.rows()).toHaveLength(2);
  });

  it('says how many available players the model does not project', async () => {
    const fixture = await render();
    expect(ngMocks.formatText(fixture)).toContain('4 available players have no projection');
  });

  it('shows the picker and remembers the league that is chosen', async () => {
    chosen = null;
    const fixture = await render();

    expect(ngMocks.formatText(fixture)).toContain('Pick the league to read free agents from');
    expect(freeAgents).not.toHaveBeenCalled();

    fixture.point.componentInstance.chooseYahoo('465.l.9', 'The Gordie Howes');
    expect(choose).toHaveBeenCalledWith({
      platform: 'YAHOO',
      leagueId: '465.l.9',
      name: 'The Gordie Howes',
    });
  });

  it('surfaces a failed read instead of an empty table', async () => {
    freeAgents.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = await render();

    // The error state is a mocked child here, so the assertion is on what it is handed.
    const errorState = ngMocks.find(fixture, ErrorStateComponent);
    expect(ngMocks.input(errorState, 'title')).toBe("Couldn't load free agents");
    expect(fixture.point.componentInstance.rows()).toHaveLength(0);
  });

  it('keeps the ESPN league id the user types', async () => {
    chosen = null;
    const fixture = await render();
    const planner = fixture.point.componentInstance;

    planner.platform.set('ESPN');
    planner.espnLeagueId.set(' 12345 ');
    planner.chooseEspn();

    expect(choose).toHaveBeenCalledWith({
      platform: 'ESPN',
      leagueId: '12345',
      name: 'ESPN league 12345',
    });
  });

  it('does nothing when no league id is typed', async () => {
    chosen = null;
    const fixture = await render();
    fixture.point.componentInstance.platform.set('ESPN');
    fixture.point.componentInstance.chooseEspn();

    expect(choose).not.toHaveBeenCalled();
    expect(league.platform).toBe('YAHOO');
  });
});
