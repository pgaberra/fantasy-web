import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { Projection } from '../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS } from '../models/stat-key.model';
import { EspnService } from '../services/espn.service';
import { FaScoutService, ScoutList, ScoutPlayer } from '../services/fa-scout.service';
import {
  PlannerLeague,
  StreamerPlannerLeagueService,
} from '../services/streamer-planner-league.service';
import { YahooService } from '../services/yahoo.service';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { FaScoutComponent, SCOUT_PAGE_SIZE } from './fa-scout';
import { ScoutTableComponent } from './scout-table/scout-table';

const LEAGUE: PlannerLeague = { platform: 'YAHOO', leagueId: '465.l.9', name: 'The Gordie Howes' };

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

describe('FaScoutComponent', () => {
  let chosen: PlannerLeague | null;
  let freeAgents: ReturnType<typeof vi.fn<() => Observable<ScoutList>>>;

  beforeEach(() => {
    chosen = LEAGUE;
    freeAgents = vi.fn(() => of(wire()));
    return MockBuilder(FaScoutComponent)
      .mock(FaScoutService, { freeAgents })
      .mock(StreamerPlannerLeagueService, {
        get league() {
          return () => chosen;
        },
      } as never)
      .mock(YahooService, { leagueProjectionSettings: () => of(SETTINGS) })
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

    expect(ngMocks.formatText(fixture)).toContain('Pick a league above');
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
});
