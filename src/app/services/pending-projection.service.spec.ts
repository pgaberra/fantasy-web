import { describe, it, expect, beforeEach } from 'vitest';
import { PendingProjectionService } from './pending-projection.service';
import { ProjectionData } from '../api/models/projection-data';

describe('PendingProjectionService', () => {
  const service = new PendingProjectionService();

  const data: ProjectionData = {
    settings: {
      scoringType: 'points',
      statWeights: { goals: 5 },
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      scaleSettings: {},
      decimalSettings: { goals: 0 },
      useDefaultDecimals: true,
    },
    players: [
      { playerId: 1, type: 'skater', stats: { utility: { gp: 82 }, scoring: { goals: 60 } } },
    ],
  };

  beforeEach(() => sessionStorage.clear());

  it('round-trips a stashed projection', () => {
    service.stash(data);

    expect(service.peek()).toEqual(data);
  });

  it('returns null when nothing is stashed', () => {
    expect(service.peek()).toEqual(null);
  });

  it('leaves the stash in place when peeking, so a failed save can be retried', () => {
    service.stash(data);

    service.peek();

    expect(service.peek()).toEqual(data);
  });

  it('drops the stash once cleared', () => {
    service.stash(data);

    service.clear();

    expect(service.peek()).toEqual(null);
  });

  it('ignores a corrupted stash rather than throwing', () => {
    sessionStorage.setItem('slapstat.pending-projection', '{ not json');

    expect(service.peek()).toEqual(null);
  });
});
