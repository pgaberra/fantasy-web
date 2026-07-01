import { describe, it, expect } from 'vitest';
import { ProjectionState } from './projection-serializer';
import { ProjectionSerializerService } from './projection-serializer.service';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SCORING_STAT_KEYS,
  SkaterUtilityStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../models/stat-key.model';
import { DecimalStatKey } from '../draft-projection/projection-settings-section/model';

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
  },
  decimalSettings: fullRecord([...SCORING_STAT_KEYS, 'gp'] as DecimalStatKey[], 0),
  useDefaultDecimals: true,
  leagueSize: 10,
  rosterSlots: { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 2, g: 2 },
  minGoalieGames: 25,
  yahooSync: {
    leagueName: 'My League',
    leagueKey: 'nhl.l.123',
    syncedAt: '2026-06-20T12:00:00.000Z',
  },
  draft: {
    teams: [
      { id: 'team-me', name: 'My Team', mine: true },
      { id: 'team-1', name: 'Team 1', mine: false },
    ],
    order: ['team-me', 'team-1'],
    picks: [{ playerId: 1, teamId: 'team-me' }],
  },
  playerProjections: [
    {
      type: 'skater',
      playerId: 1,
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: fullRecord(SKATER_SCORING_STAT_KEYS, 5),
      },
    },
    {
      type: 'goalie',
      playerId: 2,
      stats: {
        utility: { gp: 60 },
        scoring: fullRecord(GOALIE_SCORING_STAT_KEYS, 3),
      },
    },
  ],
};

describe('ProjectionSerializerService', () => {
  const service = new ProjectionSerializerService();

  it('round-trips a projection state through ProjectionData', () => {
    const roundTripped = service.fromProjectionData(service.toProjectionData(sampleState));

    expect(roundTripped).toEqual(sampleState);
  });

  it('defaults draft to null for projections without a draft', () => {
    const data = service.toProjectionData(sampleState);
    delete data.draft;

    expect(service.fromProjectionData(data).draft).toBeNull();
  });

  it('discards an invalid draft where no team is marked mine', () => {
    const data = service.toProjectionData(sampleState);
    data.draft = {
      teams: [
        { id: 'team-1', name: 'Team 1', mine: false },
        { id: 'team-2', name: 'Team 2', mine: false },
      ],
      order: ['team-1', 'team-2'],
      picks: [],
    };

    expect(service.fromProjectionData(data).draft).toBeNull();
  });

  it('discards a legacy draft that has no teams', () => {
    const data = service.toProjectionData(sampleState);
    data.draft = { teams: [], order: [], picks: [{ playerId: 1, teamId: 'gone' }] };

    expect(service.fromProjectionData(data).draft).toBeNull();
  });

  it('serializes sets and nested scale settings to arrays', () => {
    const data = service.toProjectionData(sampleState);

    expect(data.settings.activeScoringColumns).toEqual(['goals', 'assists', 'sog']);
    expect(data.settings.scaleSettings['gp'].scalableStats).toEqual(['goals', 'assists']);
    expect(data.players[1].type).toEqual('goalie');
    expect(data.settings.leagueSize).toEqual(10);
  });

  it('defaults leagueSize to 12 for older projections that omit it', () => {
    const data = service.toProjectionData(sampleState);
    delete data.settings.leagueSize;

    expect(service.fromProjectionData(data).leagueSize).toEqual(12);
  });

  it('defaults minGoalieGames to 30 for older projections that omit it', () => {
    const data = service.toProjectionData(sampleState);
    delete data.settings.minGoalieGames;

    expect(service.fromProjectionData(data).minGoalieGames).toEqual(30);
  });

  it('defaults yahooSync to null for projections never synced from Yahoo', () => {
    const data = service.toProjectionData(sampleState);
    delete data.settings.yahooSync;

    expect(service.fromProjectionData(data).yahooSync).toBeNull();
  });

  it('round-trips the yahooSync metadata', () => {
    const roundTripped = service.fromProjectionData(service.toProjectionData(sampleState));

    expect(roundTripped.yahooSync).toEqual({
      leagueName: 'My League',
      leagueKey: 'nhl.l.123',
      syncedAt: '2026-06-20T12:00:00.000Z',
    });
  });

  it('omits leagueSize, rosterSlots and minGoalieGames for points leagues', () => {
    const pointsState: ProjectionState = { ...sampleState, scoringType: 'points' };
    const settings = service.toProjectionData(pointsState).settings;

    expect(settings.leagueSize).toBeUndefined();
    expect(settings.rosterSlots).toBeUndefined();
    expect(settings.minGoalieGames).toBeUndefined();
  });

  it('round-trips rosterSlots for category leagues', () => {
    const roundTripped = service.fromProjectionData(service.toProjectionData(sampleState));

    expect(roundTripped.rosterSlots).toEqual({ c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 2, g: 2 });
  });
});
