import { describe, it, expect } from 'vitest';
import { fromProjectionData, ProjectionState, toProjectionData } from './projection-serializer';
import {
  GoalieScoringStats,
  GoalieUtilityStats,
  SkaterScoringStats,
  SkaterUtilityStats,
} from '../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SCORING_STAT_KEYS,
  SkaterUtilityStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../models/stat-key.model';
import { DecimalStatKey, ScaleConfig } from '../draft-projection/projection-settings-section/model';

function fullRecord<T extends string>(keys: readonly T[], value: number): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, value])) as Record<T, number>;
}

const sampleState: ProjectionState = {
  scoringType: 'category',
  statWeights: fullRecord(SCORING_STAT_KEYS, 1),
  activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists', 'sog']),
  activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp', 'toiPerGame']),
  scaleSettings: {
    gp: { scale: true, scalableStats: new Set<ScoringStatKey>(['goals', 'assists']) },
    toiPerGame: { scale: false, scalableStats: new Set<ScoringStatKey>() },
  } as Record<SkaterUtilityStatKey, ScaleConfig>,
  decimalSettings: fullRecord([...SCORING_STAT_KEYS, 'gp'] as DecimalStatKey[], 0),
  useDefaultDecimals: true,
  leagueSize: 10,
  playerProjections: [
    {
      type: 'skater',
      playerId: 1,
      stats: {
        utility: { gp: 82, toiPerGame: 1320 } as SkaterUtilityStats,
        scoring: fullRecord(SKATER_SCORING_STAT_KEYS, 5) as SkaterScoringStats,
      },
    },
    {
      type: 'goalie',
      playerId: 2,
      stats: {
        utility: { gp: 60 } as GoalieUtilityStats,
        scoring: fullRecord(GOALIE_SCORING_STAT_KEYS, 3) as GoalieScoringStats,
      },
    },
  ],
};

describe('projection-serializer', () => {
  it('round-trips a projection state through ProjectionData', () => {
    const roundTripped = fromProjectionData(toProjectionData(sampleState));

    expect(roundTripped).toEqual(sampleState);
  });

  it('serializes sets and nested scale settings to arrays', () => {
    const data = toProjectionData(sampleState);

    expect(data.settings.activeScoringColumns).toEqual(['goals', 'assists', 'sog']);
    expect(data.settings.scaleSettings['gp'].scalableStats).toEqual(['goals', 'assists']);
    expect(data.players[1].type).toEqual('goalie');
    expect(data.settings.leagueSize).toEqual(10);
  });

  it('defaults leagueSize to 12 for older projections that omit it', () => {
    const data = toProjectionData(sampleState);
    delete data.settings.leagueSize;

    expect(fromProjectionData(data).leagueSize).toEqual(12);
  });

  it('omits leagueSize for points leagues', () => {
    const pointsState: ProjectionState = { ...sampleState, scoringType: 'points' };

    expect(toProjectionData(pointsState).settings.leagueSize).toBeUndefined();
  });
});
