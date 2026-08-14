import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { credentialStatus as credentialStatusFn } from '../api/fn/espn/credential-status';
import { credentialValues as credentialValuesFn } from '../api/fn/espn/credential-values';
import { saveCredentials as saveCredentialsFn } from '../api/fn/espn/save-credentials';
import { deleteCredentials as deleteCredentialsFn } from '../api/fn/espn/delete-credentials';
import { projectionSettings1 } from '../api/fn/espn/projection-settings-1';
import { teams1 } from '../api/fn/espn/teams-1';
import {
  CredentialStatusResponse,
  CredentialValuesResponse,
  EspnCredentialsRequest,
  EspnLeagueTeamsResponse,
  LeagueProjectionSettingsResponse,
} from '../api/models';

/**
 * User-facing ESPN integration. ESPN has no OAuth: public leagues are read with just a league
 * id + season, private leagues with the user's stored espn_s2 + SWID cookies.
 */
@Injectable({
  providedIn: 'root',
})
export class EspnService {
  private readonly api = inject(Api);

  credentialStatus(): Observable<CredentialStatusResponse> {
    return from(this.api.invoke(credentialStatusFn));
  }

  /** The caller's own stored cookies, so the form can show them filled in. 404 when none. */
  credentialValues(): Observable<CredentialValuesResponse> {
    return from(this.api.invoke(credentialValuesFn));
  }

  saveCredentials(body: EspnCredentialsRequest): Observable<void> {
    return from(this.api.invoke(saveCredentialsFn, { body }));
  }

  deleteCredentials(): Observable<void> {
    return from(this.api.invoke(deleteCredentialsFn));
  }

  leagueProjectionSettings(leagueId: string): Observable<LeagueProjectionSettingsResponse> {
    return from(this.api.invoke(projectionSettings1, { leagueId }));
  }

  leagueTeams(leagueId: string): Observable<EspnLeagueTeamsResponse> {
    return from(this.api.invoke(teams1, { leagueId }));
  }
}
