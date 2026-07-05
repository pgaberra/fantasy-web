import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { connect } from '../api/fn/yahoo/connect';
import { connection } from '../api/fn/yahoo/connection';
import { leagues } from '../api/fn/yahoo/leagues';
import { projectionSettings } from '../api/fn/yahoo/projection-settings';
import { teams } from '../api/fn/yahoo/teams';
import {
  AuthorizeUrlResponse,
  ConnectionResponse,
  LeagueProjectionSettingsResponse,
  LeaguesResponse,
  LeagueTeamsResponse,
} from '../api/models';

/** User-facing Yahoo integration: connect your own account + read your leagues/settings. */
@Injectable({
  providedIn: 'root',
})
export class YahooService {
  private readonly api = inject(Api);

  connectionStatus(): Observable<ConnectionResponse> {
    return from(this.api.invoke(connection));
  }

  startConnect(): Observable<AuthorizeUrlResponse> {
    return from(this.api.invoke(connect));
  }

  myLeagues(): Observable<LeaguesResponse> {
    return from(this.api.invoke(leagues));
  }

  leagueProjectionSettings(leagueKey: string): Observable<LeagueProjectionSettingsResponse> {
    return from(this.api.invoke(projectionSettings, { leagueKey }));
  }

  leagueTeams(leagueKey: string): Observable<LeagueTeamsResponse> {
    return from(this.api.invoke(teams, { leagueKey }));
  }
}
