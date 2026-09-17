import { Projection, ScoringType } from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { DecimalStatKey, ScaleConfig } from '../draft-projection/projection-settings-section/model';
import { RosterSlots } from '../api/models/roster-slots';
import { YahooSync } from '../api/models/yahoo-sync';
import { EspnSync } from '../api/models/espn-sync';
import { DraftState } from '../api/models/draft-state';
import { ManualRanking } from '../models/manual-ranking';
import { PositionOverrides } from '../models/position-override';
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
   * The ESPN league this projection last imported from. Outlives `espnSync`, which is cleared
   * when the user takes the projection out of sync — the league is still where they import from.
   */
  lastEspnLeagueId: string | null;
  /**
   * What the player rows started from, and which player sync they were last squared with. The
   * server owns both — it seeds a new projection and reconciles a saved one against the pool —
   * so the app only carries them so they survive a save rather than being dropped by it.
   */
  playerBasis: PlayerBasis | null;
  playerPoolSyncedAt: string | null;
  /**
   * The players the server added to match the pool that the owner has not acknowledged yet. The
   * server fills it; the app empties it when the owner presses "Got it", and the save carries that
   * back. Empty is the normal case.
   */
  unacknowledgedNewPlayerIds: number[];
  manualRanking: ManualRanking;
  draft: DraftState | null;
  /**
   * The positions the owner corrected by hand, keyed by player. Empty is the normal case: it
   * means every player is on the positions the read model reports.
   */
  positionOverrides: PositionOverrides;
}
