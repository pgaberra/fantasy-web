import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { getSkaters } from '../api/fn/players/get-skaters';
import { getGoalies } from '../api/fn/players/get-goalies';
import { SkaterResponse } from '../api/models/skater-response';
import { GoalieResponse } from '../api/models/goalie-response';
import { Goalie, Player, Skater } from '../models/player.model';

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
}

function skaterResponseToSkater(skater: SkaterResponse): Skater {
  return {
    type: 'skater',
    id: skater.id,
    name: skater.name,
    teamAbbrev: skater.teamAbbrev,
    headshot: skater.headshot,
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
    headshot: goalie.headshot,
    stats: goalie.stats,
  };
}
