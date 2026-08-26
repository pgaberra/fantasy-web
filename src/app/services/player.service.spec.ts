import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MockProvider } from 'ng-mocks';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api/api';
import { SkaterResponse } from '../api/models/skater-response';
import { GoalieResponse } from '../api/models/goalie-response';
import { environment } from '../../environments/environment';
import { PlayerService } from './player.service';

/**
 * A headshot arrives one of two ways, and which one decides whether the API base belongs in
 * front of it: a path when this service serves the picture, an absolute URL when it lives on
 * the platform's own image CDN and the browser should fetch it there. Prefixing an absolute
 * one yields `https://api…/https://…` and a broken image, which is what these pin down.
 *
 * What it is never is the source image the platform holds — a multi-megapixel original for an
 * avatar drawn at 28px.
 */
describe('PlayerService', () => {
  function serviceReturning(skaters: SkaterResponse[], goalies: GoalieResponse[]): PlayerService {
    TestBed.configureTestingModule({
      providers: [
        MockProvider(Api, {
          invoke: (operation: unknown) =>
            Promise.resolve(
              (operation as { name?: string }).name === 'getGoalies' ? goalies : skaters,
            ),
        } as Partial<Api>),
      ],
    });
    return TestBed.inject(PlayerService);
  }

  // A preview draws five rows; the editor projects against every player. The limit is what
  // keeps the first from downloading what only the second needs.
  it('passes a limit through to the player endpoints, and none when there is none', async () => {
    const calls: { name?: string; params?: unknown }[] = [];
    TestBed.configureTestingModule({
      providers: [
        MockProvider(Api, {
          invoke: (operation: unknown, params?: unknown) => {
            calls.push({ name: (operation as { name?: string }).name, params });
            return Promise.resolve([]);
          },
        } as Partial<Api>),
      ],
    });
    const service = TestBed.inject(PlayerService);

    await firstValueFrom(service.getPlayers({ skaters: 25, goalies: 10 }));
    await firstValueFrom(service.getSkaters());

    expect(calls).toEqual([
      { name: 'getSkaters', params: { limit: 25 } },
      { name: 'getGoalies', params: { limit: 10 } },
      { name: 'getSkaters', params: { limit: undefined } },
    ]);
  });

  it('resolves a headshot path against the API base URL', async () => {
    const service = serviceReturning([skater('/players/9245/headshot')], []);

    const skaters = await firstValueFrom(service.getSkaters());

    expect(skaters[0].headshot).toEqual(`${environment.apiUrl}/players/9245/headshot`);
  });

  it('leaves a headshot that is already an absolute URL alone', async () => {
    const cdn = 'https://a.espncdn.com/i/headshots/nhl/players/full/3024816.png';
    const service = serviceReturning([skater(cdn)], []);

    const skaters = await firstValueFrom(service.getSkaters());

    expect(skaters[0].headshot).toEqual(cdn);
  });

  it('leaves a player without a headshot undefined', async () => {
    const service = serviceReturning([], [goalie(undefined)]);

    const goalies = await firstValueFrom(service.getGoalies());

    expect(goalies[0].headshot).toBeUndefined();
  });

  function skater(headshot: string | undefined): SkaterResponse {
    return {
      id: 9245,
      name: 'Connor McDavid',
      positions: ['C'],
      headshot,
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: {
          goals: 64,
          assists: 89,
          points: 153,
          plusMinus: 33,
          pim: 36,
          ppg: 22,
          ppa: 38,
          ppp: 60,
          shg: 1,
          sha: 0,
          shp: 1,
          stpg: 23,
          stpa: 38,
          stp: 61,
          gwg: 8,
          hatTricks: 2,
          sog: 348,
          shPct: 18.4,
          fw: 812,
          fl: 623,
          hits: 42,
          blocks: 28,
          defPoints: 0,
          shifts: 1408,
          toi: 92400,
        },
      },
    };
  }

  function goalie(headshot: string | undefined): GoalieResponse {
    return {
      id: 101,
      name: 'Igor Shesterkin',
      headshot,
      stats: {
        utility: { gp: 58 },
        scoring: {
          gs: 57,
          w: 36,
          l: 17,
          otl: 4,
          sho: 3,
          sa: 1720,
          sv: 1565,
          ga: 155,
          gaa: 2.67,
          svPct: 0.91,
          winPct: 0.62,
          toi: 0,
        },
      },
    };
  }
});
