import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { Api } from '../api/api';
import { streamerPlannerFreeAgents } from '../api/fn/streamer-planner/streamer-planner-free-agents';
import { FreeAgentResponse } from '../api/models/free-agent-response';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
} from '../models/stat-key.model';
import { Projection } from '../models/projection.model';
import { PlannerPlatform } from './streamer-planner-league.service';

/**
 * One available player, shaped as a {@link Projection} so the same fantasy-points and z-score
 * engine that ranks a projection ranks these too — the league's own scoring settings decide who
 * is worth picking up, and nothing about that belongs on the server.
 */
export interface FreeAgent {
  projection: Projection;
  playerId: string;
  name: string;
  teamAbbrev?: string;
  positions: string[];
  availability: FreeAgentResponse['availability'];
  /** Games the player's club plays in the week, and the ones he is expected to dress for. */
  clubGames: number;
  expectedGames: number;
}

export interface FreeAgentWeek {
  players: FreeAgent[];
  /** Available players the model has no projection for; they are counted, not listed. */
  unprojected: number;
}

@Injectable({ providedIn: 'root' })
export class StreamerPlannerFreeAgentsService {
  private readonly api = inject(Api);

  freeAgents(
    platform: PlannerPlatform,
    leagueId: string,
    start: string,
    end: string,
  ): Observable<FreeAgentWeek> {
    return from(
      this.api.invoke(streamerPlannerFreeAgents, { platform, leagueId, start, end }),
    ).pipe(
      map((answer) => ({
        players: answer.players.map(toFreeAgent),
        unprojected: answer.unprojected,
      })),
    );
  }
}

/**
 * A stat the projection does not carry is zero here rather than absent, because the ranking
 * engine works on complete stat lines. `gp` is the games the player is **expected** to play,
 * which is what a per-game view of a week should divide by.
 */
function statsFrom<K extends string>(
  keys: readonly K[],
  stats: Record<string, number>,
): Record<K, number> {
  return keys.reduce((line, key) => ({ ...line, [key]: stats[key] ?? 0 }), {} as Record<K, number>);
}

function toFreeAgent(player: FreeAgentResponse): FreeAgent {
  const skater = player.type === 'skater';
  // The ranking engine keys players by number, and the platforms number theirs. A player whose id
  // is not a number cannot be ranked against the rest, so he is given a stable negative key that
  // collides with nothing.
  const playerId = Number(player.playerId);
  return {
    playerId: player.playerId,
    name: player.name,
    teamAbbrev: player.teamAbbrev,
    positions: player.positions,
    availability: player.availability,
    clubGames: player.clubGames,
    expectedGames: player.expectedGames,
    projection: {
      type: skater ? 'skater' : 'goalie',
      playerId: Number.isFinite(playerId) ? playerId : -1,
      stats: {
        scoring: statsFrom(
          skater ? SKATER_SCORING_STAT_KEYS : GOALIE_SCORING_STAT_KEYS,
          player.stats,
        ),
        utility: {
          ...statsFrom(skater ? SKATER_UTILITY_STAT_KEYS : GOALIE_UTILITY_STAT_KEYS, player.stats),
          gp: player.expectedGames,
        },
      },
    },
  };
}
