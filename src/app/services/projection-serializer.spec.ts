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
  espnSync: null,
  lastEspnLeagueId: null,
  playerBasis: 'last_season',
  playerPoolSyncedAt: '2026-08-16T04:12:00.000Z',
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

  it('carries the draft finishedAt marker through a save/load round-trip', () => {
    const finishedState: ProjectionState = {
      ...sampleState,
      draft: { ...sampleState.draft!, finishedAt: '2026-07-15T10:00:00.000Z' },
    };

    const roundTripped = service.fromProjectionData(service.toProjectionData(finishedState));

    expect(roundTripped.draft?.finishedAt).toEqual('2026-07-15T10:00:00.000Z');
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

  it('round-trips the espnSync metadata', () => {
    const espnState: ProjectionState = {
      ...sampleState,
      yahooSync: null,
      espnSync: {
        leagueName: "Alexander's ESPN League",
        leagueId: '123456',
        syncedAt: '2026-08-14T15:00:00.000Z',
      },
    };

    const roundTripped = service.fromProjectionData(service.toProjectionData(espnState));

    expect(roundTripped.espnSync).toEqual({
      leagueName: "Alexander's ESPN League",
      leagueId: '123456',
      syncedAt: '2026-08-14T15:00:00.000Z',
    });
  });

  it('falls back to the stamp for a projection saved before the league was remembered', () => {
    const data = service.toProjectionData({
      ...sampleState,
      lastEspnLeagueId: null,
      espnSync: {
        leagueName: 'My 2027 League',
        leagueId: '1052312029',
        syncedAt: '2026-08-16T11:10:00.000Z',
      },
    });
    delete data.settings.lastEspnLeagueId;

    expect(service.fromProjectionData(data).lastEspnLeagueId).toEqual('1052312029');
  });

  it('defaults espnSync to null for projections never synced from ESPN', () => {
    const data = service.toProjectionData(sampleState);

    expect(data.settings.espnSync).toBeUndefined();
    expect(service.fromProjectionData(data).espnSync).toBeNull();
  });

  it('omits leagueSize and minGoalieGames for points leagues but keeps rosterSlots', () => {
    const pointsState: ProjectionState = { ...sampleState, scoringType: 'points' };
    const settings = service.toProjectionData(pointsState).settings;

    expect(settings.leagueSize).toBeUndefined();
    expect(settings.minGoalieGames).toBeUndefined();
    expect(settings.rosterSlots).toEqual({ c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 2, g: 2 });
  });

  it('round-trips rosterSlots for both category and points leagues', () => {
    const expected = { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 2, g: 2 };

    expect(service.fromProjectionData(service.toProjectionData(sampleState)).rosterSlots).toEqual(
      expected,
    );

    const pointsState: ProjectionState = { ...sampleState, scoringType: 'points' };
    expect(service.fromProjectionData(service.toProjectionData(pointsState)).rosterSlots).toEqual(
      expected,
    );
  });
});
