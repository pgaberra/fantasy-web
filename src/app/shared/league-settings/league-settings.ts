import { ProjectionState } from '../../services/projection-serializer';
import { DraftSettings } from '../../api/models/draft-settings';
import { ProjectionSettings } from '../../api/models/projection-settings';
import { DEFAULT_ROSTER_SLOTS } from '../../draft-projection/projection-defaults';
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
 * Where the draft picker puts the league it set, as `DraftSettings`, in the navigation's history
 * state. Nothing is saved on the picker: the league belongs to the draft, and the draft only
 * exists once the draft page's setup is confirmed. History state rather than a service, so a
 * reload of that setup still has it.
 */
export const DRAFT_LEAGUE_STATE_KEY = 'draftLeagueSettings';

/** The league set on the draft picker, if the navigation to this page carried one. */
export function draftLeagueFromHistory(state: unknown = history.state): DraftSettings | null {
  const league = (state as Record<string, unknown> | null)?.[DRAFT_LEAGUE_STATE_KEY];
  return league && typeof league === 'object' ? (league as DraftSettings) : null;
}

/** The league half of a projection's stored settings: what a draft ranks by when it has none. */
export function draftSettingsFromProjection(settings: ProjectionSettings): DraftSettings {
  return {
    scoringType: settings.scoringType,
    statWeights: { ...settings.statWeights },
    activeScoringColumns: [...settings.activeScoringColumns],
    activeUtilityColumns: [...settings.activeUtilityColumns],
    leagueSize: settings.leagueSize,
    rosterSlots: settings.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
    minGoalieGames: settings.minGoalieGames,
    yahooSync: settings.yahooSync,
    espnSync: settings.espnSync,
    lastEspnLeagueId: settings.lastEspnLeagueId,
  };
}

/** A league as the draft stores it. Absent stamps are left out rather than sent as null. */
export function draftSettingsOf(league: LeagueSettings): DraftSettings {
  return {
    scoringType: league.scoringType,
    statWeights: { ...league.statWeights },
    activeScoringColumns: [...league.activeScoringColumns],
    activeUtilityColumns: [...league.activeUtilityColumns],
    leagueSize: league.leagueSize,
    rosterSlots: { ...league.rosterSlots },
    minGoalieGames: league.minGoalieGames,
    ...(league.yahooSync ? { yahooSync: league.yahooSync } : {}),
    ...(league.espnSync ? { espnSync: league.espnSync } : {}),
    ...(league.lastEspnLeagueId ? { lastEspnLeagueId: league.lastEspnLeagueId } : {}),
  };
}

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

/**
 * The leagues set on a page before a board exists: by what each was set for, and the last league
 * imported there. An import is the user saying which league they play in, so every starting point
 * takes it — a board as much as a preset — while a hand edit stays with what it was made for.
 */
export interface PageLeagues {
  readonly byKey: ReadonlyMap<string, LeagueSettings>;
  readonly imported: LeagueSettings | null;
}

export const NO_PAGE_LEAGUES: PageLeagues = { byKey: new Map(), imported: null };

/**
 * The page's leagues with `next` set for `key`, where `previous` is what `key` showed before. A
 * new import replaces every edit made so far, everywhere: they were made against a league the user
 * has since said is not theirs.
 */
export function withPageLeague(
  leagues: PageLeagues,
  key: string,
  previous: LeagueSettings | null,
  next: LeagueSettings,
): PageLeagues {
  const stamp = syncStamp(next);
  if (stamp !== null && stamp !== syncStamp(previous)) {
    return { byKey: new Map([[key, next]]), imported: next };
  }
  return { ...leagues, byKey: new Map(leagues.byKey).set(key, next) };
}

/**
 * The league set on the page for `key`: its own edit, else the page's import laid over what the
 * starting point opens with, else undefined when nothing was set — which leaves a copy exact.
 * `opensWith` is null while that is still unknown, and then only an edit of its own can answer.
 */
export function pageLeagueFor(
  leagues: PageLeagues,
  key: string,
  opensWith: LeagueSettings | null,
): LeagueSettings | undefined {
  const own = leagues.byKey.get(key);
  if (own) {
    return own;
  }
  if (!leagues.imported || !opensWith) {
    return undefined;
  }
  // The goalie minimum is not something an import sets, so the starting point keeps its own.
  return { ...leagues.imported, minGoalieGames: opensWith.minGoalieGames };
}

/** Which import a league carries, as the moment it was made. */
function syncStamp(league: LeagueSettings | null): string | null {
  return league?.yahooSync?.syncedAt ?? league?.espnSync?.syncedAt ?? null;
}
