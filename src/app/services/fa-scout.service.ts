import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { Api } from '../api/api';
import { faScoutFreeAgents } from '../api/fn/fa-scout/fa-scout-free-agents';
import { faScoutMyTeam } from '../api/fn/fa-scout/fa-scout-my-team';
import { ScoutLine } from '../api/models/scout-line';
import { ScoutPlayerResponse } from '../api/models/scout-player-response';
import { ScoutRosterPlayer } from '../api/models/scout-roster-player';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
} from '../models/stat-key.model';
import { Projection } from '../models/projection.model';
import { wholeGamesLine } from '../streamer-planner/planner-free-agents';
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

/**
 * A player on the user's own team, with the model's rest of the season on the line the available
 * players carry, so a pickup can be weighed against him.
 */
export interface TeamPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly teamAbbrev?: string;
  readonly type: 'skater' | 'goalie';
  readonly positions: readonly string[];
  readonly injuryStatus?: string;
  /** The slot he sits in today, in the platform's spelling (C, BN, IR, IR+, NA, ...). */
  readonly slot?: string;
  /** On injured reserve or not-active: a slot that takes no roster spot, so dropping him makes none. */
  readonly reserve: boolean;
  /** The injured-reserve slots the platform lets him be moved into today; empty when healthy. */
  readonly reserveEligible: readonly string[];
  /** Fills no lineup slot now: on reserve, or out injured or suspended. Day-to-day is not out. */
  readonly out: boolean;
  /** His rest of the season; null when the model has no line for him. */
  readonly projection: Projection | null;
}

export interface ScoutTeam {
  /** False when no team in the league is the user's: one they only follow, say. */
  readonly found: boolean;
  readonly teamName: string | null;
  readonly players: readonly TeamPlayer[];
}

@Injectable({ providedIn: 'root' })
export class FaScoutService {
  private readonly api = inject(Api);

  myTeam(platform: LeaguePlatform, leagueId: string): Observable<ScoutTeam> {
    return from(this.api.invoke(faScoutMyTeam, { platform, leagueId })).pipe(
      map((answer) => ({
        found: answer.found,
        teamName: answer.teamName ?? null,
        players: answer.players.map(toTeamPlayer),
      })),
    );
  }

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

/**
 * The line over the whole games its own round to: a player plays a game or does not, so the GP
 * column's 58 is given 58 games' worth, not the 57.6 it rounds from.
 */
function projectionOf(type: 'skater' | 'goalie', playerId: number, line: ScoutLine): Projection {
  const skater = type === 'skater';
  const projection: Projection = {
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
  return wholeGamesLine(projection, line.games);
}

/**
 * The ranking engine keys players by number, and the platforms number theirs. A player whose id is
 * not a number is given a key that collides with nothing, as in the planner.
 */
function rankingKey(playerId: string): number {
  const numeric = Number(playerId);
  return Number.isFinite(numeric) ? numeric : -1;
}

function toTeamPlayer(player: ScoutRosterPlayer): TeamPlayer {
  const type = player.type === 'goalie' ? 'goalie' : 'skater';
  return {
    playerId: player.playerId,
    name: player.name,
    teamAbbrev: player.teamAbbrev,
    type,
    positions: player.positions,
    injuryStatus: player.injuryStatus,
    slot: player.slot,
    reserve: player.reserve,
    reserveEligible: player.reserveEligible,
    out: player.out,
    projection: player.restOfSeason
      ? projectionOf(type, rankingKey(player.playerId), player.restOfSeason)
      : null,
  };
}

function toScoutPlayer(player: ScoutPlayerResponse): ScoutPlayer {
  const type = player.type === 'goalie' ? 'goalie' : 'skater';
  const playerId = rankingKey(player.playerId);
  const games = Math.round(player.restOfSeason.games);
  return {
    freeAgent: {
      playerId: player.playerId,
      name: player.name,
      teamAbbrev: player.teamAbbrev,
      positions: player.positions,
      availability: player.availability,
      clubGames: games,
      expectedGames: games,
      projected: new Set(Object.keys(player.restOfSeason.stats)),
      projection: projectionOf(type, playerId, player.restOfSeason),
    },
    preseason: player.preseason ? projectionOf(type, playerId, player.preseason) : null,
  };
}
