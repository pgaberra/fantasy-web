import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { getSkaters } from '../api/fn/players/get-skaters';
import { getGoalies } from '../api/fn/players/get-goalies';
import { getRookies } from '../api/fn/players/get-rookies';
import { getInjuries } from '../api/fn/players/get-injuries';
import { SkaterResponse } from '../api/models/skater-response';
import { GoalieResponse } from '../api/models/goalie-response';
import { PlayerInjury } from '../api/models/player-injury';
import { Goalie, Player, Skater } from '../models/player.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private readonly api = inject(Api);

  /**
   * The skaters, highest scoring first. `limit` asks the BFF for only that many — the top of the
   * board rather than the pool, for a caller that draws a handful of rows. The editor takes them
   * all: it ranks and scores every player, and a slice would rank the slice.
   */
  getSkaters(limit?: number): Observable<Skater[]> {
    return from(this.api.invoke(getSkaters, { limit })).pipe(
      map((skaters) => skaters.map(skaterResponseToSkater)),
    );
  }

  /** The goalies, most wins first. `limit` behaves as it does for {@link getSkaters}. */
  getGoalies(limit?: number): Observable<Goalie[]> {
    return from(this.api.invoke(getGoalies, { limit })).pipe(
      map((goalies) => goalies.map(goalieResponseToGoalie)),
    );
  }

  getPlayers(limits?: { skaters: number; goalies: number }): Observable<Player[]> {
    return forkJoin({
      skaters: this.getSkaters(limits?.skaters),
      goalies: this.getGoalies(limits?.goalies),
    }).pipe(map(({ skaters, goalies }) => [...skaters, ...goalies]));
  }

  /**
   * Ids of the players who are rookies this season, or null when the server cannot say — which
   * is a different answer from nobody being one, and the one production gives while the
   * projection service is switched off. Callers must hide the marker on null rather than
   * showing every player as a veteran.
   */
  getRookieIds(): Observable<Set<number> | null> {
    return from(this.api.invoke(getRookies)).pipe(
      map((rookies) => (rookies.known ? new Set(rookies.playerIds) : null)),
    );
  }

  /**
   * Who is hurt right now, by player id, or null when the server cannot say — the same
   * distinction the rookie list draws, and for the same reason: an empty injury list and an
   * unanswerable one would otherwise both read as a fit league.
   *
   * Unlike the rookie list this describes today rather than the season, and it is refreshed once
   * a night, so a stale copy marks recovered players as out.
   */
  getInjuries(): Observable<Map<number, PlayerInjury> | null> {
    return from(this.api.invoke(getInjuries)).pipe(
      map((injuries) =>
        injuries.known
          ? new Map(injuries.players.map((injury) => [injury.playerId, injury]))
          : null,
      ),
    );
  }
}

/**
 * A headshot arrives either as a path relative to the API base — which stays correct whichever
 * environment served it — or as an absolute URL when the picture lives on the platform's own
 * image CDN and the browser should fetch it there rather than through the BFF. Everything
 * downstream — the table, the draft board, a shared projection's snapshot — just reads
 * `headshot`.
 */
function headshotUrl(pathOrUrl: string | undefined): string | undefined {
  if (!pathOrUrl) {
    return undefined;
  }
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${environment.apiUrl}${pathOrUrl}`;
}

function skaterResponseToSkater(skater: SkaterResponse): Skater {
  return {
    type: 'skater',
    id: skater.id,
    name: skater.name,
    teamAbbrev: skater.teamAbbrev,
    headshot: headshotUrl(skater.headshot),
    positions: new Set(skater.positions),
    stats: skater.stats,
  };
}

function goalieResponseToGoalie(goalie: GoalieResponse): Goalie {
  return {
    type: 'goalie',
    id: goalie.id,
    name: goalie.name,
    teamAbbrev: goalie.teamAbbrev,
    headshot: headshotUrl(goalie.headshot),
    stats: goalie.stats,
  };
}
