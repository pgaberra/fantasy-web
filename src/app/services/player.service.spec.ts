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
 * The BFF reports a headshot as a path relative to the API base, never as Yahoo's own image
 * URL — that source is a multi-megapixel original for an avatar drawn at 28px.
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

  it('resolves a headshot path against the API base URL', async () => {
    const service = serviceReturning([skater('/players/9245/headshot')], []);

    const skaters = await firstValueFrom(service.getSkaters());

    expect(skaters[0].headshot).toEqual(`${environment.apiUrl}/players/9245/headshot`);
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
