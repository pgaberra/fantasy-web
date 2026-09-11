import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
import { ApiConfiguration } from '../api/api-configuration';
import { skaterSplits } from '../api/fn/projection-model/skater-splits';
import { goalieSplits } from '../api/fn/projection-model/goalie-splits';
import { splitSeasons } from '../api/fn/projection-model/split-seasons';
import { PlayerSplitResponse } from '../api/models/player-split-response';
import { SplitSeasonListResponse } from '../api/models/split-season-list-response';
import {
  GOALIE_SCORING_STAT_KEYS,
  GOALIE_UTILITY_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
} from '../models/stat-key.model';
import { Projection } from '../models/projection.model';

/**
 * A stretch of a season's schedule, in team game numbers: both bounds, inclusive, or `lastGames`,
 * each team's own last N, which the server counts back from that team's latest game. Mid-season
 * teams stand on different game numbers, so no pair of bounds could say "the last 5".
 */
export type GameSpan =
  | { season: number; fromGame: number; toGame: number; lastGames?: undefined }
  | { season: number; lastGames: number; fromGame?: undefined; toGame?: undefined };

/**
 * One player's measured production over a span, shaped as a {@link Projection} so the same
 * fantasy-points and z-score engine that ranks a projection can rank these too.
 */
export interface HotPlayer {
  projection: Projection;
  name: string;
  teamAbbrev?: string;
  /** Games this player actually dressed for within the span, which is rarely the whole span. */
  games: number;
  firstTeamGame?: number;
  lastTeamGame?: number;
}

/**
 * The whole league, near enough — the page ranks everyone and filters client-side, and asking
 * for fewer would silently cut off the tail of a position filter.
 */
const MAX_PLAYERS = 1000;

@Injectable({
  providedIn: 'root',
})
export class WhosHotService {
  /**
   * The generated operations are called directly rather than through {@link Api}, whose `invoke`
   * hands back a promise. A promise cannot be cancelled, so an abandoned span — the caller moves
   * the range again before this one lands — would keep running to completion at the server.
   * Staying with the observable lets the caller's unsubscribe abort the request in flight, which
   * is what keeps a drag across the slider from becoming a burst the edge rate-limiter rejects.
   */
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  /**
   * Every season the leaderboard can measure, with its own length and how far it has got, and
   * the season to open on: the newest with a game played, so last season until the new one is
   * underway.
   */
  seasons(): Observable<SplitSeasonListResponse> {
    return splitSeasons(this.http, this.rootUrl).pipe(map((sent) => sent.body));
  }

  splits(span: GameSpan): Observable<HotPlayer[]> {
    const params = {
      season: span.season,
      fromGame: span.fromGame,
      toGame: span.toGame,
      lastGames: span.lastGames,
      limit: MAX_PLAYERS,
    };
    return forkJoin({
      skaters: skaterSplits(this.http, this.rootUrl, params).pipe(map((sent) => sent.body)),
      goalies: goalieSplits(this.http, this.rootUrl, params).pipe(map((sent) => sent.body)),
    }).pipe(map(({ skaters, goalies }) => [...skaters.map(toSkater), ...goalies.map(toGoalie)]));
  }
}

/**
 * A stat the split doesn't mention is zero here rather than absent, because the ranking engine
 * works on complete stat lines. The distinction that does survive is `games`: a player who
 * dressed for none of the span shows zero games, and the per-game view leaves them out.
 */
function statsFrom<K extends string>(
  keys: readonly K[],
  stats: Record<string, number>,
): Record<K, number> {
  return keys.reduce((line, key) => ({ ...line, [key]: stats[key] ?? 0 }), {} as Record<K, number>);
}

function toSkater(split: PlayerSplitResponse): HotPlayer {
  return {
    ...identity(split),
    projection: {
      type: 'skater',
      playerId: split.playerId,
      stats: {
        scoring: statsFrom(SKATER_SCORING_STAT_KEYS, split.stats),
        utility: { ...statsFrom(SKATER_UTILITY_STAT_KEYS, split.stats), gp: split.games },
      },
    },
  };
}

function toGoalie(split: PlayerSplitResponse): HotPlayer {
  return {
    ...identity(split),
    projection: {
      type: 'goalie',
      playerId: split.playerId,
      stats: {
        scoring: statsFrom(GOALIE_SCORING_STAT_KEYS, split.stats),
        utility: { ...statsFrom(GOALIE_UTILITY_STAT_KEYS, split.stats), gp: split.games },
      },
    },
  };
}

function identity(split: PlayerSplitResponse): Omit<HotPlayer, 'projection'> {
  return {
    name: split.name,
    teamAbbrev: split.teamAbbrev,
    games: split.games,
    firstTeamGame: split.firstTeamGame,
    lastTeamGame: split.lastTeamGame,
  };
}
