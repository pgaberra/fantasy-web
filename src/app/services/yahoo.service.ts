import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { connect } from '../api/fn/yahoo/connect';
import { connection } from '../api/fn/yahoo/connection';
import { leagues } from '../api/fn/yahoo/leagues';
import { settings } from '../api/fn/yahoo/settings';
import {
  AuthorizeUrlResponse,
  ConnectionResponse,
  LeagueSettingsResponse,
  LeaguesResponse,
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

  leagueSettings(leagueKey: string): Observable<LeagueSettingsResponse> {
    return from(this.api.invoke(settings, { leagueKey }));
  }
}
