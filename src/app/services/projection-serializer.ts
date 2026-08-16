import { Projection, ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { DecimalStatKey, ScaleConfig } from '../draft-projection/projection-settings-section/model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';
import { EspnSync } from '../api/models/espn-sync';
import { DraftState } from '../api/models/draft-state';
import { ProjectionSettings } from '../api/models/projection-settings';

export type PlayerBasis = NonNullable<ProjectionSettings['playerBasis']>;

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
  /** At most one of the two is ever set — a projection's settings came from one league. */
  yahooSync: YahooSync | null;
  espnSync: EspnSync | null;
  /**
   * What the player rows started from, and which player sync they were last squared with. The
   * server owns both — it seeds a new projection and reconciles a saved one against the pool —
   * so the app only carries them so they survive a save rather than being dropped by it.
   */
  playerBasis: PlayerBasis | null;
  playerPoolSyncedAt: string | null;
  draft: DraftState | null;
}
