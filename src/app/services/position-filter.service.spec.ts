import { PositionFilterService } from './position-filter.service';
import { Player } from '../models/player.model';
import { GoalieStats, Projection, SkaterStats } from '../models/projection.model';

describe('PositionFilterService', () => {
  let service: PositionFilterService;

  beforeEach(() => {
    service = new PositionFilterService();
  });

  const emptySkaterStats: SkaterStats = {
    utility: { gp: 0, toiPerGame: 0 },
    scoring: {
      goals: 0,
      assists: 0,
      plusMinus: 0,
      pim: 0,
      ppg: 0,
      ppa: 0,
      shg: 0,
      sha: 0,
      gwg: 0,
      sog: 0,
      shPct: 0,
      fw: 0,
      fl: 0,
      hits: 0,
      blocks: 0,
    },
  };

  const emptyGoalieStats: GoalieStats = {
    utility: { gp: 0 },
    scoring: {
      gs: 0,
      w: 0,
      l: 0,
      sho: 0,
      sa: 0,
      sv: 0,
      ga: 0,
      gaa: 0,
      svPct: 0,
    },
  };

  const skater1: Player = {
    id: 1,
    name: 'Skater 1',
    type: 'skater',
    positions: new Set(['LW', 'C']),
    stats: emptySkaterStats,
  };

  const skater2: Player = {
    id: 2,
    name: 'Skater 2',
    type: 'skater',
    positions: new Set(['D']),
    stats: emptySkaterStats,
  };

  const goalie: Player = {
    id: 3,
    name: 'Goalie',
    type: 'goalie',
    stats: emptyGoalieStats,
  };

  const projections: Projection[] = [
    { playerId: 1, type: 'skater', stats: emptySkaterStats },
    { playerId: 2, type: 'skater', stats: emptySkaterStats },
    { playerId: 3, type: 'goalie', stats: emptyGoalieStats },
  ];

  const playerMap = new Map<number, Player>([
    [1, skater1],
    [2, skater2],
    [3, goalie],
  ]);

  it('should filter by ALL', () => {
    const result = service.filterByPosition(projections, playerMap, 'ALL');
    expect(result.length).toEqual(3);
  });

  it('should filter by SKATER (Forwards/Defensemen)', () => {
    const result = service.filterByPosition(projections, playerMap, 'SKATER');
    expect(result.length).toEqual(2);
    expect(result.every((p) => p.type === 'skater')).toEqual(true);
  });

  it('should filter by G (Goalies)', () => {
    const result = service.filterByPosition(projections, playerMap, 'G');
    expect(result.length).toEqual(1);
    expect(result[0].type).toEqual('goalie');
  });

  it('should filter by specific position (LW)', () => {
    const result = service.filterByPosition(projections, playerMap, 'LW');
    expect(result.length).toEqual(1);
    expect(result[0].playerId).toEqual(1);
  });

  it('should filter by specific position (D)', () => {
    const result = service.filterByPosition(projections, playerMap, 'D');
    expect(result.length).toEqual(1);
    expect(result[0].playerId).toEqual(2);
  });
});
