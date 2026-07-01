import { Projection, ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { DecimalStatKey, ScaleConfig } from '../draft-projection/projection-settings-section/model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';
import { DraftState } from '../api/models/draft-state';

export interface ProjectionState {
  scoringType: ScoringType;
  statWeights: Record<ScoringStatKey, number>;
  activeScoringColumns: Set<ScoringStatKey>;
  activeUtilityColumns: Set<SkaterUtilityStatKey>;
  scaleSettings: Record<SkaterUtilityStatKey, ScaleConfig>;
  decimalSettings: Record<DecimalStatKey, number>;
  useDefaultDecimals: boolean;
  leagueSize: number;
  rosterSlots: RosterSlots;
  minGoalieGames: number;
  playerProjections: Projection[];
  yahooSync: YahooSync | null;
  draft: DraftState | null;
}
