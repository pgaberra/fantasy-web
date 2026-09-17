import { ProjectionState } from '../../services/projection-serializer';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../models/stat-key.model';
import { YahooSyncResult } from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from '../../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';

/**
 * The part of a projection's settings that describes the league rather than the numbers: how it
 * scores, on which stats, how big it is, what it rosters, and which league it was imported from.
 * It is what a draft is ranked by, and what a league import overwrites.
 */
export type LeagueSettings = Pick<
  ProjectionState,
  | 'scoringType'
  | 'statWeights'
  | 'activeScoringColumns'
  | 'activeUtilityColumns'
  | 'leagueSize'
  | 'rosterSlots'
  | 'minGoalieGames'
  | 'yahooSync'
  | 'espnSync'
  | 'lastEspnLeagueId'
>;

/**
 * Where the draft picker puts the league set for a preset in the navigation's history state, as
 * the `ProjectionSettings` a board stores. The preset's board is only created once the draft
 * page's setup is confirmed, so the league has to travel there; history state rather than a
 * service, so a reload of that setup still has it.
 */
export const DRAFT_LEAGUE_STATE_KEY = 'draftLeagueSettings';

export function leagueSettingsOf(state: ProjectionState): LeagueSettings {
  return {
    scoringType: state.scoringType,
    statWeights: state.statWeights,
    activeScoringColumns: state.activeScoringColumns,
    activeUtilityColumns: state.activeUtilityColumns,
    leagueSize: state.leagueSize,
    rosterSlots: state.rosterSlots,
    minGoalieGames: state.minGoalieGames,
    yahooSync: state.yahooSync,
    espnSync: state.espnSync,
    lastEspnLeagueId: state.lastEspnLeagueId,
  };
}

/**
 * What a league import sets. League size and weights only when the league reports them: a
 * category league has no weights, and the weights already in place are kept for the day the
 * league is switched back to points.
 */
function withImportedSettings(
  settings: LeagueSettings,
  mapped: LeagueProjectionSettingsResponse,
): LeagueSettings {
  return {
    ...settings,
    scoringType: mapped.scoringType,
    activeScoringColumns: new Set(mapped.activeScoringColumns as ScoringStatKey[]),
    activeUtilityColumns: new Set(mapped.activeUtilityColumns as SkaterUtilityStatKey[]),
    rosterSlots: mapped.rosterSlots,
    leagueSize: mapped.leagueSize ?? settings.leagueSize,
    statWeights: mapped.statWeights
      ? (mapped.statWeights as Record<ScoringStatKey, number>)
      : settings.statWeights,
  };
}

export function withYahooImport(
  settings: LeagueSettings,
  result: YahooSyncResult,
  syncedAt = new Date().toISOString(),
): LeagueSettings {
  return {
    ...withImportedSettings(settings, result.settings),
    yahooSync: { leagueName: result.leagueName, leagueKey: result.leagueKey, syncedAt },
    // These settings are Yahoo's now, so an ESPN stamp would mislabel them.
    espnSync: null,
  };
}

export function withEspnImport(
  settings: LeagueSettings,
  result: EspnSyncResult,
  syncedAt = new Date().toISOString(),
): LeagueSettings {
  return {
    ...withImportedSettings(settings, result.settings),
    espnSync: {
      // ESPN names the league in its settings response; the user only ever typed the id.
      leagueName: result.leagueName ?? result.leagueId,
      leagueId: result.leagueId,
      syncedAt,
    },
    lastEspnLeagueId: result.leagueId,
    yahooSync: null,
  };
}
