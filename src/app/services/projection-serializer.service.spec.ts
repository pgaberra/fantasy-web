import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ProjectionSerializerService } from './projection-serializer.service';
import { ProjectionData } from '../api/models/projection-data';
import {
  GOALIE_SCORING_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SCORING_STAT_KEYS,
} from '../models/stat-key.model';

/**
 * A projection stored before hat tricks, shifts, overtime losses and time on ice were stat
 * keys — the shape every projection saved up to that point still has in the database. The
 * table rounds every key it knows, so anything missing here used to throw and take the whole
 * table down with it.
 */
const SAVED_BEFORE_THE_ESPN_STATS: ProjectionData = {
  settings: {
    scoringType: 'points',
    statWeights: { goals: 4.5, assists: 3, hits: 0.33, blocks: 0.5, w: 4, sv: 0.2, ga: -1 },
    activeScoringColumns: ['goals', 'assists', 'ppp', 'hits', 'blocks', 'w', 'sv', 'ga'],
    activeUtilityColumns: ['gp'],
    scaleSettings: { gp: { scale: true, scalableStats: ['goals', 'assists'] } },
    decimalSettings: { goals: 0, assists: 0, gp: 0 },
    useDefaultDecimals: true,
    leagueSize: 12,
    minGoalieGames: 30,
  },
  players: [
    {
      playerId: 1,
      type: 'skater',
      stats: {
        utility: { gp: 82, toiPerGame: 1320 },
        scoring: { goals: 64, assists: 89, points: 153, hits: 42, blocks: 28 },
      },
    },
    {
      playerId: 101,
      type: 'goalie',
      stats: { utility: { gp: 58 }, scoring: { w: 36, l: 17, sv: 1565, ga: 155 } },
    },
  ],
};

const compare = (left: string, right: string): number => left.localeCompare(right);

describe('ProjectionSerializerService', () => {
  beforeEach(() => MockBuilder(ProjectionSerializerService));

  const serializer = (): ProjectionSerializerService => {
    MockRender();
    return ngMocks.get(ProjectionSerializerService);
  };

  it('fills in the stats a projection saved before them does not carry', () => {
    const state = serializer().fromProjectionData(SAVED_BEFORE_THE_ESPN_STATS);

    const skater = state.playerProjections[0];
    const goalie = state.playerProjections[1];
    expect(Object.keys(skater.stats.scoring).sort(compare)).toEqual(
      [...SKATER_SCORING_STAT_KEYS].sort(compare),
    );
    expect(Object.keys(goalie.stats.scoring).sort(compare)).toEqual(
      [...GOALIE_SCORING_STAT_KEYS].sort(compare),
    );
  });

  it('keeps the values that were stored', () => {
    const state = serializer().fromProjectionData(SAVED_BEFORE_THE_ESPN_STATS);

    const skater = state.playerProjections[0];
    expect(skater.type).toEqual('skater');
    if (skater.type === 'skater') {
      expect(skater.stats.scoring.goals).toEqual(64);
      expect(skater.stats.scoring.assists).toEqual(89);
      // Nothing was recorded for these, and zero is what an unplayed stat is worth.
      expect(skater.stats.scoring.hatTricks).toEqual(0);
      expect(skater.stats.scoring.shifts).toEqual(0);
    }
  });

  it('completes the weights and decimals so every stat can be scored and rounded', () => {
    const state = serializer().fromProjectionData(SAVED_BEFORE_THE_ESPN_STATS);

    expect(SCORING_STAT_KEYS.filter((key) => state.statWeights[key] === undefined)).toEqual([]);
    expect(SCORING_STAT_KEYS.filter((key) => state.decimalSettings[key] === undefined)).toEqual([]);
    // A stored weight still wins over the default.
    expect(state.statWeights.goals).toEqual(4.5);
  });

  it('survives a round trip once the missing stats are filled in', () => {
    const service = serializer();
    const restored = service.fromProjectionData(
      service.toProjectionData(service.fromProjectionData(SAVED_BEFORE_THE_ESPN_STATS)),
    );

    expect(restored.playerProjections).toHaveLength(2);
    expect(restored.activeScoringColumns.has('goals')).toEqual(true);
  });
});
