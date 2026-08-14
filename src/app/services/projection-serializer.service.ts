import { Injectable } from '@angular/core';
import { ProjectionData } from '../api/models/projection-data';
import { PlayerProjection as ApiPlayerProjection } from '../api/models/player-projection';
import { GoalieUtilityStats, Projection, SkaterUtilityStats } from '../models/projection.model';
import {
  GOALIE_SCORING_STAT_KEYS,
  GoalieScoringStatKey,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SkaterScoringStatKey,
  SkaterUtilityStatKey,
} from '../models/stat-key.model';
import {
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from '../draft-projection/projection-settings-section/model';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_STAT_WEIGHTS,
} from '../draft-projection/projection-defaults';
import { DraftState } from '../api/models/draft-state';
import { ProjectionState } from './projection-serializer';

/**
 * A stat line holding every key the app knows about today, zero-filling the ones a stored
 * projection predates.
 *
 * <p>Projections are saved as whatever the stat vocabulary was on the day they were written, so
 * one saved before hat tricks and shifts existed carries neither. The types claim a complete
 * record, and the table trusts that — it rounds every key, so a missing one threw and took the
 * whole table down. Old projections are the normal case, not an edge case, so the shape is
 * completed here at the boundary rather than guarded at each of the places that read it.
 */
function everyStat<K extends SkaterScoringStatKey | GoalieScoringStatKey>(
  keys: readonly K[],
  stored: { [key: string]: number },
): Record<K, number> {
  const complete = {} as Record<K, number>;
  keys.forEach((key) => (complete[key] = stored[key] ?? 0));
  return complete;
}

@Injectable({ providedIn: 'root' })
export class ProjectionSerializerService {
  toProjectionData(state: ProjectionState): ProjectionData {
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
        // Roster slots drive the draft's roster (and the draft-setup editor) for both league
        // types, so they must persist regardless of scoring basis — unlike leagueSize /
        // minGoalieGames, which only matter for category ranking.
        rosterSlots: { ...state.rosterSlots },
        minGoalieGames: state.scoringType === 'category' ? state.minGoalieGames : undefined,
        yahooSync: state.yahooSync ?? undefined,
        espnSync: state.espnSync ?? undefined,
      },
      players: state.playerProjections.map((projection) => ({
        playerId: projection.playerId,
        type: projection.type,
        stats: {
          utility: { ...(projection.stats.utility as Record<string, number>) },
          scoring: { ...(projection.stats.scoring as Record<string, number>) },
        },
      })),
      draft: state.draft ? this.cloneDraft(state.draft) : undefined,
    };
  }

  fromProjectionData(data: ProjectionData): ProjectionState {
    const scaleSettings = {} as Record<SkaterUtilityStatKey, ScaleConfig>;
    for (const [key, config] of Object.entries(data.settings.scaleSettings)) {
      scaleSettings[key as SkaterUtilityStatKey] = {
        scale: config.scale,
        scalableStats: new Set(config.scalableStats as ScoringStatKey[]),
      };
    }
    return {
      scoringType: data.settings.scoringType,
      statWeights: { ...DEFAULT_STAT_WEIGHTS, ...data.settings.statWeights },
      activeScoringColumns: new Set(data.settings.activeScoringColumns as ScoringStatKey[]),
      activeUtilityColumns: new Set(data.settings.activeUtilityColumns as SkaterUtilityStatKey[]),
      scaleSettings,
      decimalSettings: { ...DEFAULT_DECIMAL_SETTINGS, ...data.settings.decimalSettings },
      useDefaultDecimals: data.settings.useDefaultDecimals,
      leagueSize: data.settings.leagueSize ?? DEFAULT_LEAGUE_SIZE,
      rosterSlots: data.settings.rosterSlots ?? { ...DEFAULT_ROSTER_SLOTS },
      minGoalieGames: data.settings.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES,
      yahooSync: data.settings.yahooSync ?? null,
      espnSync: data.settings.espnSync ?? null,
      draft: this.sanitizeDraft(data.draft),
      playerProjections: data.players.map((player) => this.toProjection(player)),
    };
  }

  private toProjection(player: ApiPlayerProjection): Projection {
    if (player.type === 'skater') {
      return {
        type: 'skater',
        playerId: player.playerId,
        stats: {
          utility: player.stats.utility as SkaterUtilityStats,
          scoring: everyStat(SKATER_SCORING_STAT_KEYS, player.stats.scoring),
        },
      };
    }
    return {
      type: 'goalie',
      playerId: player.playerId,
      stats: {
        utility: player.stats.utility as GoalieUtilityStats,
        scoring: everyStat(GOALIE_SCORING_STAT_KEYS, player.stats.scoring),
      },
    };
  }

  private cloneDraft(draft: DraftState): DraftState {
    return {
      teams: draft.teams.map((team) => ({ ...team })),
      order: [...draft.order],
      picks: draft.picks.map((pick) => ({ ...pick })),
      // Carry the finished marker through every save/load round-trip; omit the key entirely
      // while the draft is still in progress so the persisted JSON stays minimal.
      ...(draft.finishedAt ? { finishedAt: draft.finishedAt } : {}),
    };
  }

  private sanitizeDraft(raw: DraftState | undefined): DraftState | null {
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
    return this.cloneDraft(raw);
  }
}
