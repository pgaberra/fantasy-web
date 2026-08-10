import { ScoringStatKey, SkaterUtilityStatKey, SCORING_STAT_KEYS } from '../models/stat-key.model';
import { DEFAULT_DECIMAL_SETTINGS, ScaleConfig } from './projection-settings-section/model';
import { RosterSlots } from '../api/models/roster-slots';
import { ProjectionState } from '../services/projection-serializer';

export const DEFAULT_STAT_WEIGHTS: Record<ScoringStatKey, number> = {
  goals: 4.5,
  assists: 3,
  points: 0,
  sog: 0.5,
  hits: 0.33,
  blocks: 0.5,
  gwg: 0.5,
  pim: 0.5,
  ppg: 0.5,
  ppa: 0.5,
  ppp: 0.5,
  shg: 0.5,
  sha: 0.5,
  shp: 0,
  stpg: 0,
  stpa: 0,
  stp: 0,
  hatTricks: 0,
  shPct: 0.5,
  fw: 0.5,
  fl: 0.5,
  plusMinus: 0.5,
  defPoints: 0,
  shifts: 0,
  toi: 0,
  gs: 0,
  w: 4,
  l: 0,
  otl: 0,
  sho: 3,
  sa: 0,
  sv: 0.2,
  ga: -1,
  gaa: 0,
  svPct: 0,
  winPct: 0,
};

export const DEFAULT_SCORING_COLUMNS: ScoringStatKey[] = [
  'goals',
  'assists',
  'ppp',
  'hits',
  'blocks',
  'w',
  'sv',
  'ga',
];

export const DEFAULT_UTILITY_COLUMNS: SkaterUtilityStatKey[] = ['gp'];

export const DEFAULT_LEAGUE_SIZE = 12;

export const DEFAULT_MIN_GOALIE_GAMES = 30;

/**
 * NHL regular-season length. From 2026-27 the season expands from 82 to 84 games.
 * The player stats we project from come from an 82-game season, so the one-click
 * "full season" action scales goalie games by FULL_SEASON_GAMES / PREVIOUS_SEASON_GAMES
 * (keeping their share of the season constant), while skaters — assumed to play the whole
 * season — are set to 84 outright.
 */
export const FULL_SEASON_GAMES = 84;
export const PREVIOUS_SEASON_GAMES = 82;

export const DEFAULT_ROSTER_SLOTS: RosterSlots = {
  c: 2,
  lw: 2,
  rw: 2,
  d: 4,
  util: 0,
  bn: 4,
  g: 2,
};

export function createDefaultScaleSettings(
  isRateStat: (key: ScoringStatKey) => boolean,
): Record<SkaterUtilityStatKey, ScaleConfig> {
  const scalableStats = new Set<ScoringStatKey>(SCORING_STAT_KEYS.filter((k) => !isRateStat(k)));
  return {
    gp: { scale: true, scalableStats },
    toiPerGame: { scale: true, scalableStats },
  };
}

/**
 * The settings a projection starts from before anyone edits it. Shared by creating a
 * projection and by starting a draft off a preset, so a preset draft ranks players exactly
 * like a freshly created projection would.
 *
 * The player rows are left empty on purpose: the server fills them in from its own read model
 * (see `CreateProjectionRequest.source`) rather than having the client upload ~1600 players it
 * just downloaded.
 */
export function createDefaultProjectionState(
  isRateStat: (key: ScoringStatKey) => boolean,
): ProjectionState {
  return {
    scoringType: 'points',
    statWeights: DEFAULT_STAT_WEIGHTS,
    activeScoringColumns: new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS),
    activeUtilityColumns: new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS),
    scaleSettings: createDefaultScaleSettings(isRateStat),
    decimalSettings: DEFAULT_DECIMAL_SETTINGS,
    useDefaultDecimals: true,
    leagueSize: DEFAULT_LEAGUE_SIZE,
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
    yahooSync: null,
    draft: null,
    playerProjections: [],
  };
}
