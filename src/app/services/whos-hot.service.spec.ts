import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api/api';
import { skaterSplits } from '../api/fn/projection-model/skater-splits';
import { PlayerSplitResponse } from '../api/models/player-split-response';
import { HotPlayer, WhosHotService } from './whos-hot.service';
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

/** `Api.invoke` resolves a promise, so the mock has to as well or `from(...)` gets an array. */
type InvokeFn = (fn: unknown, params?: unknown) => Promise<PlayerSplitResponse[]>;

describe('WhosHotService', () => {
  let service: WhosHotService;
  let invoke: ReturnType<typeof vi.fn<InvokeFn>>;

  beforeEach(() => {
    invoke = vi.fn<InvokeFn>();
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: { invoke } }],
    });
    service = TestBed.inject(WhosHotService);
  });

  it('asks for both bounds of the span, for skaters and goalies alike', async () => {
    invoke.mockReturnValue(Promise.resolve([]));

    await firstValueFrom(service.splits({ season: 2025, fromGame: 50, toGame: 82 }));

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1]).toEqual(
      expect.objectContaining({ season: 2025, fromGame: 50, toGame: 82 }),
    );
  });

  it('shapes a skater split as a projection the ranking engine can score', async () => {
    invoke.mockImplementation((fn: unknown) =>
      Promise.resolve(fn === skaterSplits ? [split()] : []),
    );

    const [hot] = await firstValueFrom(service.splits({ season: 2025, fromGame: 63, toGame: 82 }));

    expect(hot.projection.type).toEqual('skater');
    expect(skaterScoring(hot).goals).toEqual(13);
    expect(skaterScoring(hot).hits).toEqual(18);
    expect(hot.name).toEqual('Connor McDavid');
    expect(hot.games).toEqual(20);
  });

  it('fills a stat the split never mentioned with zero, so the stat line is complete', async () => {
    invoke.mockImplementation((fn: unknown) =>
      Promise.resolve(fn === skaterSplits ? [split({ stats: { goals: 4 } })] : []),
    );

    const [hot] = await firstValueFrom(service.splits({ season: 2025, fromGame: 63, toGame: 82 }));

    expect(skaterScoring(hot).assists).toEqual(0);
    expect(skaterScoring(hot).fw).toEqual(0);
  });

  it('takes games played from the split rather than from the stat map', async () => {
    invoke.mockImplementation((fn: unknown) =>
      Promise.resolve(fn === skaterSplits ? [split({ games: 17 })] : []),
    );

    const [hot] = await firstValueFrom(service.splits({ season: 2025, fromGame: 63, toGame: 82 }));

    expect(hot.projection.stats.utility.gp).toEqual(17);
  });

  it('returns skaters and goalies together', async () => {
    invoke.mockImplementation((fn: unknown) =>
      Promise.resolve(
        fn === skaterSplits
          ? [split()]
          : [split({ playerId: 6000, name: 'Stuart Skinner', type: 'goalie', stats: { w: 12 } })],
      ),
    );

    const hot = await firstValueFrom(service.splits({ season: 2025, fromGame: 63, toGame: 82 }));

    expect(hot.map((player) => player.projection.type)).toEqual(['skater', 'goalie']);
    expect(goalieScoring(hot[1]).w).toEqual(12);
  });
});
