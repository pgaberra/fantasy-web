import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { PlayerSplitResponse } from '../api/models/player-split-response';
import { GameSpan, HotPlayer, WhosHotService } from './whos-hot.service';
import { GoalieScoringStats, SkaterScoringStats } from '../models/projection.model';

function skaterScoring(hot: HotPlayer): SkaterScoringStats {
  if (hot.projection.type !== 'skater') {
    throw new Error(`expected a skater, got a ${hot.projection.type}`);
  }
  return hot.projection.stats.scoring;
}

function goalieScoring(hot: HotPlayer): GoalieScoringStats {
  if (hot.projection.type !== 'goalie') {
    throw new Error(`expected a goalie, got a ${hot.projection.type}`);
  }
  return hot.projection.stats.scoring;
}

function split(overrides: Partial<PlayerSplitResponse> = {}): PlayerSplitResponse {
  return {
    playerId: 5000,
    name: 'Connor McDavid',
    teamAbbrev: 'EDM',
    type: 'skater',
    games: 20,
    firstTeamGame: 63,
    lastTeamGame: 82,
    stats: { goals: 13, assists: 20, points: 33, hits: 18, blocks: 9 },
    ...overrides,
  };
}

const SPAN: GameSpan = { season: 2025, fromGame: 63, toGame: 82 };

describe('WhosHotService', () => {
  let service: WhosHotService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WhosHotService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function pending(half: 'skaters' | 'goalies'): TestRequest {
    return httpTesting.expectOne((request) => request.url.endsWith(`/splits/${half}`));
  }

  /**
   * Both halves have to be answered before the span resolves — the service asks for skaters and
   * goalies together and only emits once it has both.
   */
  function answer(skaters: PlayerSplitResponse[], goalies: PlayerSplitResponse[] = []): void {
    pending('skaters').flush(skaters);
    pending('goalies').flush(goalies);
  }

  it('asks for both bounds of the span, for skaters and goalies alike', async () => {
    const splits = firstValueFrom(service.splits({ season: 2025, fromGame: 50, toGame: 82 }));

    for (const half of ['skaters', 'goalies'] as const) {
      const asked = pending(half);
      expect(asked.request.params.get('season')).toEqual('2025');
      expect(asked.request.params.get('fromGame')).toEqual('50');
      expect(asked.request.params.get('toGame')).toEqual('82');
      asked.flush([]);
    }

    expect(await splits).toEqual([]);
  });

  it('asks for the last N as a count, so mid-season the server counts each team back itself', async () => {
    const splits = firstValueFrom(service.splits({ season: 2026, lastGames: 5 }));

    for (const half of ['skaters', 'goalies'] as const) {
      const asked = pending(half);
      expect(asked.request.params.get('season')).toEqual('2026');
      expect(asked.request.params.get('lastGames')).toEqual('5');
      expect(asked.request.params.has('fromGame')).toEqual(false);
      expect(asked.request.params.has('toGame')).toEqual(false);
      asked.flush([]);
    }

    expect(await splits).toEqual([]);
  });

  it('reads each season with its own length from the server', async () => {
    const seasons = firstValueFrom(service.seasons());

    httpTesting
      .expectOne((request) => request.url.endsWith('/splits/seasons'))
      .flush({
        defaultSeason: 2025,
        seasons: [
          { season: 2026, scheduleGames: 84, gamesPlayed: 0 },
          { season: 2025, scheduleGames: 82, gamesPlayed: 82 },
        ],
      });

    const answer = await seasons;
    expect(answer.defaultSeason).toEqual(2025);
    expect(answer.seasons.map((season) => season.scheduleGames)).toEqual([84, 82]);
  });

  it('drops the request when the caller moves on, rather than leaving it running at the server', () => {
    const subscription = service.splits(SPAN).subscribe();
    const inFlight = httpTesting.match(() => true);

    subscription.unsubscribe();

    expect(inFlight).toHaveLength(2);
    expect(inFlight.every((request) => request.cancelled)).toBe(true);
  });

  it('shapes a skater split as a projection the ranking engine can score', async () => {
    const splits = firstValueFrom(service.splits(SPAN));
    answer([split()]);

    const [hot] = await splits;

    expect(hot.projection.type).toEqual('skater');
    expect(skaterScoring(hot).goals).toEqual(13);
    expect(skaterScoring(hot).hits).toEqual(18);
    expect(hot.name).toEqual('Connor McDavid');
    expect(hot.games).toEqual(20);
  });

  it('fills a stat the split never mentioned with zero, so the stat line is complete', async () => {
    const splits = firstValueFrom(service.splits(SPAN));
    answer([split({ stats: { goals: 4 } })]);

    const [hot] = await splits;

    expect(skaterScoring(hot).assists).toEqual(0);
    expect(skaterScoring(hot).fw).toEqual(0);
  });

  it('takes games played from the split rather than from the stat map', async () => {
    const splits = firstValueFrom(service.splits(SPAN));
    answer([split({ games: 17 })]);

    const [hot] = await splits;

    expect(hot.projection.stats.utility.gp).toEqual(17);
  });

  it('returns skaters and goalies together', async () => {
    const splits = firstValueFrom(service.splits(SPAN));
    answer(
      [split()],
      [split({ playerId: 6000, name: 'Stuart Skinner', type: 'goalie', stats: { w: 12 } })],
    );

    const hot = await splits;

    expect(hot.map((player) => player.projection.type)).toEqual(['skater', 'goalie']);
    expect(goalieScoring(hot[1]).w).toEqual(12);
  });
});
