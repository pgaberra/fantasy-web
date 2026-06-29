import { ProjectionData } from '../api/models/projection-data';
import { PlayerProjection as ApiPlayerProjection } from '../api/models/player-projection';
import {
  GoalieScoringStats,
  GoalieUtilityStats,
  Projection,
  ScoringType,
  SkaterScoringStats,
  SkaterUtilityStats,
} from '../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';
import { DecimalStatKey, ScaleConfig } from '../draft-projection/projection-settings-section/model';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../draft-projection/projection-defaults';
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

export function toProjectionData(state: ProjectionState): ProjectionData {
  const scaleSettings: { [key: string]: { scale: boolean; scalableStats: string[] } } = {};
  for (const [key, config] of Object.entries(state.scaleSettings)) {
    scaleSettings[key] = { scale: config.scale, scalableStats: [...config.scalableStats] };
  }
  return {
    settings: {
      scoringType: state.scoringType,
      statWeights: { ...state.statWeights },
      activeScoringColumns: [...state.activeScoringColumns],
      activeUtilityColumns: [...state.activeUtilityColumns],
      scaleSettings,
      decimalSettings: { ...state.decimalSettings },
      useDefaultDecimals: state.useDefaultDecimals,
      leagueSize: state.scoringType === 'category' ? state.leagueSize : undefined,
      rosterSlots: state.scoringType === 'category' ? { ...state.rosterSlots } : undefined,
      minGoalieGames: state.scoringType === 'category' ? state.minGoalieGames : undefined,
      yahooSync: state.yahooSync ?? undefined,
    },
    players: state.playerProjections.map((projection) => ({
      playerId: projection.playerId,
      type: projection.type,
      stats: {
        utility: { ...(projection.stats.utility as Record<string, number>) },
        scoring: { ...(projection.stats.scoring as Record<string, number>) },
      },
    })),
    draft: state.draft ? cloneDraft(state.draft) : undefined,
  };
}

export function fromProjectionData(data: ProjectionData): ProjectionState {
  const scaleSettings = {} as Record<SkaterUtilityStatKey, ScaleConfig>;
  for (const [key, config] of Object.entries(data.settings.scaleSettings)) {
    scaleSettings[key as SkaterUtilityStatKey] = {
      scale: config.scale,
      scalableStats: new Set(config.scalableStats as ScoringStatKey[]),
    };
  }
  return {
    scoringType: data.settings.scoringType,
    statWeights: data.settings.statWeights as Record<ScoringStatKey, number>,
    activeScoringColumns: new Set(data.settings.activeScoringColumns as ScoringStatKey[]),
    activeUtilityColumns: new Set(data.settings.activeUtilityColumns as SkaterUtilityStatKey[]),
    scaleSettings,
    decimalSettings: data.settings.decimalSettings as Record<DecimalStatKey, number>,
    useDefaultDecimals: data.settings.useDefaultDecimals,
    leagueSize: data.settings.leagueSize ?? DEFAULT_LEAGUE_SIZE,
    rosterSlots: data.settings.rosterSlots ?? { ...DEFAULT_ROSTER_SLOTS },
    minGoalieGames: data.settings.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES,
    yahooSync: data.settings.yahooSync ?? null,
    draft: sanitizeDraft(data.draft),
    playerProjections: data.players.map(toProjection),
  };
}

function toProjection(player: ApiPlayerProjection): Projection {
  if (player.type === 'skater') {
    return {
      type: 'skater',
      playerId: player.playerId,
      stats: {
        utility: player.stats.utility as SkaterUtilityStats,
        scoring: player.stats.scoring as SkaterScoringStats,
      },
    };
  }
  return {
    type: 'goalie',
    playerId: player.playerId,
    stats: {
      utility: player.stats.utility as GoalieUtilityStats,
      scoring: player.stats.scoring as GoalieScoringStats,
    },
  };
}

function cloneDraft(draft: DraftState): DraftState {
  return {
    teams: draft.teams.map((team) => ({ ...team })),
    order: [...draft.order],
    picks: draft.picks.map((pick) => ({ ...pick })),
  };
}

function sanitizeDraft(raw: DraftState | undefined): DraftState | null {
  if (!raw || !Array.isArray(raw.teams) || raw.teams.length === 0) {
    return null;
  }
  if (!Array.isArray(raw.order) || !Array.isArray(raw.picks)) {
    return null;
  }
  if (raw.teams.filter((team) => team.mine).length !== 1) {
    return null;
  }
  const ids = new Set(raw.teams.map((team) => team.id));
  if (new Set(raw.order).size !== ids.size || !raw.order.every((id) => ids.has(id))) {
    return null;
  }
  if (!raw.picks.every((pick) => ids.has(pick.teamId))) {
    return null;
  }
  return cloneDraft(raw);
}
