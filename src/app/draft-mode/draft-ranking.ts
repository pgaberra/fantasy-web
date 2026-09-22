import { DraftSettings } from '../api/models/draft-settings';
import { ProjectionData } from '../api/models/projection-data';
import { StatWeights } from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { RankingInput } from '../services/projection-ranking.service';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
} from '../draft-projection/projection-defaults';
import { DecimalStatKey } from '../draft-projection/projection-settings-section/model';
import { readableDecimalSettings } from '../draft-projection/projection-settings-section/model-decimals';

/**
 * How a draft's players are ranked: the projection it is played against, scored by the league the
 * draft carries. The board and the summary both rank this way, and they have to rank identically —
 * the summary's table is the board's own order, totalled per team.
 */
export function draftRankingInput(
  data: ProjectionData,
  league: DraftSettings,
  serializer: ProjectionSerializerService,
): RankingInput {
  // How the numbers are rounded is the projection's; how they are scored is the draft's.
  const settings = data.settings;
  const projections = serializer.fromProjectionData(data).playerProjections;
  return {
    projections,
    scoringType: league.scoringType,
    statWeights: league.statWeights as StatWeights,
    activeScoringColumns: new Set(league.activeScoringColumns as ScoringStatKey[]),
    leagueSize: league.leagueSize ?? DEFAULT_LEAGUE_SIZE,
    rosterSlots: league.rosterSlots,
    minGoalieGames: league.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES,
    // The order is the projection's, not the draft's league: a board drafted against a
    // projection has to be the board the owner arranged, or the best available is a different
    // player here than on the page it was started from.
    manualRanking: serializer.manualRankingFrom(settings.manualRanking),
    // As the editor reads them: a board of the model's fractional lines is ranked here the way
    // it was ranked there, rather than on numbers rounded to whole ones on the way in.
    decimalSettings: readableDecimalSettings(
      projections,
      settings.decimalSettings as Record<DecimalStatKey, number>,
      settings.useDefaultDecimals ?? true,
    ),
  };
}
