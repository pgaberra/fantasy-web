import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { Api } from '../api/api';
import { faScoutFreeAgents } from '../api/fn/fa-scout/fa-scout-free-agents';
import { ScoutLine } from '../api/models/scout-line';
import { ScoutPlayerResponse } from '../api/models/scout-player-response';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
} from '../models/stat-key.model';
import { Projection } from '../models/projection.model';
import { FreeAgent } from './streamer-planner-free-agents.service';
import { LeaguePlatform } from './league-choice.service';

/**
 * One available player as the FA scout reads him: his rest of the season, shaped as the planner's
 * {@link FreeAgent} so the same table helpers draw it, and the line the model gave him before the
 * season began, or null where it gave him none.
 */
export interface ScoutPlayer {
  /** The rest of the season: `projection` is its line, `expectedGames` its games. */
  readonly freeAgent: FreeAgent;
  readonly preseason: Projection | null;
}

export interface ScoutList {
  /** False before the season's first game and after its last: there is no rest of it to show. */
  readonly inSeason: boolean;
  /** False when the model's preseason line is not stored, so nobody can read as rising. */
  readonly preseasonAvailable: boolean;
  readonly players: readonly ScoutPlayer[];
}

@Injectable({ providedIn: 'root' })
export class FaScoutService {
  private readonly api = inject(Api);

  freeAgents(platform: LeaguePlatform, leagueId: string): Observable<ScoutList> {
    return from(this.api.invoke(faScoutFreeAgents, { platform, leagueId })).pipe(
      map((answer) => ({
        inSeason: answer.inSeason,
        preseasonAvailable: answer.preseasonAvailable,
        players: answer.players.map(toScoutPlayer),
      })),
    );
  }
}

/**
 * A stat the line does not carry is zero here rather than absent, because the ranking engine works
 * on complete stat lines. `gp` is the games the line covers.
 */
function statsFrom<K extends string>(
  keys: readonly K[],
  stats: Record<string, number>,
): Record<K, number> {
  return keys.reduce((line, key) => ({ ...line, [key]: stats[key] ?? 0 }), {} as Record<K, number>);
}

function projectionOf(type: 'skater' | 'goalie', playerId: number, line: ScoutLine): Projection {
  const skater = type === 'skater';
  return {
    type,
    playerId,
    stats: {
      scoring: statsFrom(skater ? SKATER_SCORING_STAT_KEYS : GOALIE_SCORING_STAT_KEYS, line.stats),
      utility: {
        ...statsFrom(skater ? SKATER_UTILITY_STAT_KEYS : GOALIE_UTILITY_STAT_KEYS, line.stats),
        gp: line.games,
      },
    },
  };
}

function toScoutPlayer(player: ScoutPlayerResponse): ScoutPlayer {
  const type = player.type === 'goalie' ? 'goalie' : 'skater';
  // The ranking engine keys players by number, and the platforms number theirs. A player whose id
  // is not a number is given a key that collides with nothing, as in the planner.
  const numeric = Number(player.playerId);
  const playerId = Number.isFinite(numeric) ? numeric : -1;
  return {
    freeAgent: {
      playerId: player.playerId,
      name: player.name,
      teamAbbrev: player.teamAbbrev,
      positions: player.positions,
      availability: player.availability,
      clubGames: player.restOfSeason.games,
      expectedGames: player.restOfSeason.games,
      projected: new Set(Object.keys(player.restOfSeason.stats)),
      projection: projectionOf(type, playerId, player.restOfSeason),
    },
    preseason: player.preseason ? projectionOf(type, playerId, player.preseason) : null,
  };
}
