import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { getSkaters } from '../api/fn/players/get-skaters';
import { getGoalies } from '../api/fn/players/get-goalies';
import { getRookies } from '../api/fn/players/get-rookies';
import { SkaterResponse } from '../api/models/skater-response';
import { GoalieResponse } from '../api/models/goalie-response';
import { Goalie, Player, Skater } from '../models/player.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private readonly api = inject(Api);

  getSkaters(): Observable<Skater[]> {
    return from(this.api.invoke(getSkaters)).pipe(
      map((skaters) => skaters.map(skaterResponseToSkater)),
    );
  }

  getGoalies(): Observable<Goalie[]> {
    return from(this.api.invoke(getGoalies)).pipe(
      map((goalies) => goalies.map(goalieResponseToGoalie)),
    );
  }

  getPlayers(): Observable<Player[]> {
    return forkJoin({ skaters: this.getSkaters(), goalies: this.getGoalies() }).pipe(
      map(({ skaters, goalies }) => [...skaters, ...goalies]),
    );
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
