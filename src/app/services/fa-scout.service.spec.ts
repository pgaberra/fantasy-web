import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api/api';
import { faScoutFreeAgents } from '../api/fn/fa-scout/fa-scout-free-agents';
import { faScoutMyTeam } from '../api/fn/fa-scout/fa-scout-my-team';
import { ScoutListResponse } from '../api/models/scout-list-response';
import { Projection } from '../models/projection.model';
import { FaScoutService } from './fa-scout.service';

/** A line's stats by key, whichever kind of player it is. */
const scoring = (line: Projection | null | undefined) =>
  line?.stats.scoring as Record<string, number> | undefined;

const ANSWER: ScoutListResponse = {
  season: 2026,
  modelVersion: 'marcel-v118',
  inSeason: true,
  preseasonAvailable: true,
  players: [
    {
      playerId: '1001',
      name: 'Brandon Montour',
      teamAbbrev: 'Sea',
      type: 'skater',
      positions: ['D'],
      availability: 'WAIVERS',
      restOfSeason: { games: 70, stats: { points: 48.5, ppp: 19, toiPerGame: 1380 } },
      preseason: { games: 80, stats: { points: 30, toiPerGame: 1050 } },
    },
    {
      playerId: '1003',
      name: 'Spencer Knight',
      type: 'goalie',
      positions: ['G'],
      availability: 'FREE_AGENT',
      restOfSeason: { games: 50, stats: { gs: 50, w: 24, svPct: 0.905 } },
    },
  ],
};

describe('FaScoutService', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(ANSWER);
    return MockBuilder(FaScoutService).mock(Api, { invoke });
  });

  const read = () => firstValueFrom(TestBed.inject(FaScoutService).freeAgents('YAHOO', '465.l.9'));

  it("asks the BFF for the league's wire", async () => {
    await read();

    expect(invoke).toHaveBeenCalledWith(faScoutFreeAgents, {
      platform: 'YAHOO',
      leagueId: '465.l.9',
    });
  });

  it('shapes the rest of the season as a complete line the ranking engine can score', async () => {
    const montour = (await read()).players[0];

    expect(montour.freeAgent.projection.type).toBe('skater');
    expect(montour.freeAgent.projection.playerId).toBe(1001);
    expect(scoring(montour.freeAgent.projection)?.['points']).toBe(48.5);
    // A stat the line does not carry is a zero for the engine, and not a projected one.
    expect(scoring(montour.freeAgent.projection)?.['goals']).toBe(0);
    expect(montour.freeAgent.projected.has('goals')).toBe(false);
    expect(montour.freeAgent.projection.stats.utility).toEqual({ gp: 70, toiPerGame: 1380 });
    expect(montour.freeAgent.expectedGames).toBe(70);
    expect(montour.freeAgent.availability).toBe('WAIVERS');
  });

  it('keeps the preseason line over its own games', async () => {
    const montour = (await read()).players[0];

    expect(scoring(montour.preseason)?.['points']).toBe(30);
    expect(montour.preseason?.stats.utility.gp).toBe(80);
  });

  it('leaves the preseason line out where the model had none', async () => {
    const knight = (await read()).players[1];

    expect(knight.freeAgent.projection.type).toBe('goalie');
    expect(knight.preseason).toBeNull();
  });

  it('passes on whether the season is under way and the preseason line stored', async () => {
    const list = await read();

    expect(list.inSeason).toBe(true);
    expect(list.preseasonAvailable).toBe(true);
  });

  it("reads the user's team, each player with his rest of the season as a line", async () => {
    invoke.mockResolvedValue({
      found: true,
      teamName: 'Slapshots',
      players: [
        {
          playerId: '6743',
          name: 'Cale Makar',
          type: 'skater',
          positions: ['D'],
          slot: 'D',
          reserve: false,
          out: false,
          restOfSeason: { games: 74, stats: { points: 90 } },
        },
        {
          playerId: '6744',
          name: 'Unknown Prospect',
          type: 'skater',
          positions: ['LW'],
          slot: 'NA',
          reserve: true,
          out: true,
        },
      ],
    });

    const team = await firstValueFrom(TestBed.inject(FaScoutService).myTeam('YAHOO', '465.l.9'));

    expect(invoke).toHaveBeenCalledWith(faScoutMyTeam, { platform: 'YAHOO', leagueId: '465.l.9' });
    expect(team.teamName).toBe('Slapshots');
    expect(team.players[0].projection?.playerId).toBe(6743);
    expect(team.players[0].projection?.stats.utility.gp).toBe(74);
    expect(scoring(team.players[0].projection)?.['points']).toBe(90);
    expect(team.players[1]).toMatchObject({ reserve: true, out: true, projection: null });
  });
});
