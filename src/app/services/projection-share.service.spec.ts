import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ProjectionShareService } from './projection-share.service';
import { Player } from '../models/player.model';
import { GoalieStats, ScoredProjection, SkaterStats } from '../models/projection.model';

describe('ProjectionShareService', () => {
  let service: ProjectionShareService;

  const skaterStats = { utility: { gp: 82 }, scoring: { goals: 64 } } as SkaterStats;
  const goalieStats = { utility: { gp: 58 }, scoring: { w: 36 } } as GoalieStats;

  const players: Player[] = [
    {
      id: 1,
      type: 'skater',
      name: 'Connor McDavid',
      teamAbbrev: 'EDM',
      positions: new Set(['C']),
      stats: skaterStats,
    },
    { id: 101, type: 'goalie', name: 'Igor Shesterkin', teamAbbrev: 'NYR', stats: goalieStats },
  ];

  const ranked: ScoredProjection[] = [
    {
      projection: { playerId: 1, type: 'skater', stats: skaterStats },
      score: { fantasyPoints: 412.5, zScore: 9.1 },
      qualified: true,
    },
    {
      projection: { playerId: 101, type: 'goalie', stats: goalieStats },
      score: { fantasyPoints: 301.2, zScore: 6.4 },
      qualified: true,
    },
  ];

  const playersById = new Map<number, Player>(players.map((player) => [player.id, player]));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectionShareService);
  });

  it('freezes identity and rank onto each shared row', () => {
    const shared = service.toSharedPlayers(ranked, playersById, 'points');

    expect(shared).toHaveLength(2);
    expect(shared[0].name).toEqual('Connor McDavid');
    expect(shared[0].teamAbbrev).toEqual('EDM');
    expect(shared[0].positions).toEqual(['C']);
    expect(shared[0].rank).toEqual(1);
    expect(shared[1].rank).toEqual(2);
  });

  it('publishes fantasy points in a points league and z-score in a category league', () => {
    expect(service.toSharedPlayers(ranked, playersById, 'points')[0].value).toBeCloseTo(412.5);
    expect(service.toSharedPlayers(ranked, playersById, 'category')[0].value).toBeCloseTo(9.1);
  });

  it('leaves positions off goalies', () => {
    const goalie = service.toSharedPlayers(ranked, playersById, 'points')[1];

    expect(goalie.type).toEqual('goalie');
    expect(goalie.positions).toBeUndefined();
  });

  it('caps the rows at the requested count', () => {
    expect(service.toSharedPlayers(ranked, playersById, 'points', 1)).toHaveLength(1);
  });

  it('still publishes a row whose player is missing from the read model', () => {
    const shared = service.toSharedPlayers(ranked, new Map(), 'points');

    expect(shared[0].name).toEqual('Player 1');
    expect(shared[0].teamAbbrev).toBeUndefined();
  });
});
