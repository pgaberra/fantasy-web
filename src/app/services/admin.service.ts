import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { connectYahooServiceAccount } from '../api/fn/admin/connect-yahoo-service-account';
import { yahooServiceConnection } from '../api/fn/admin/yahoo-service-connection';
import { triggerPlayerSync } from '../api/fn/admin/trigger-player-sync';
import { playerSyncRuns } from '../api/fn/admin/player-sync-runs';
import { probeYahooAccess } from '../api/fn/admin/probe-yahoo-access';
import { yahooServiceAccountLeagues } from '../api/fn/admin/yahoo-service-account-leagues';
import { premiumCustomers } from '../api/fn/admin/premium-customers';
import { grantPremium } from '../api/fn/admin/grant-premium';
import { revokePremiumGrants } from '../api/fn/admin/revoke-premium-grants';
import {
  AdminGrantPremiumRequest,
  AdminPremiumCustomerResponse,
  AdminPremiumGrantResponse,
  AuthorizeUrlResponse,
  ConnectionResponse,
  SyncAcceptedResponse,
  LeaguesResponse,
  SyncRunResponse,
  YahooProbeResponse,
} from '../api/models';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly api = inject(Api);

  yahooConnection(): Observable<ConnectionResponse> {
    return from(this.api.invoke(yahooServiceConnection));
  }

  connectYahoo(): Observable<AuthorizeUrlResponse> {
    return from(this.api.invoke(connectYahooServiceAccount));
  }

  triggerSync(): Observable<SyncAcceptedResponse> {
    return from(this.api.invoke(triggerPlayerSync));
  }

  syncRuns(limit = 10): Observable<SyncRunResponse[]> {
    return from(this.api.invoke(playerSyncRuns, { limit }));
  }

  /**
   * Asks Yahoo whether it will serve a game's players. A refusal comes back as a normal answer
   * with Yahoo's own wording — that is the point, so don't treat a non-ok result as an error.
   */
  probeYahooAccess(
    gameKey: string,
    season?: string,
    leagueKey?: string,
    target?: string,
  ): Observable<YahooProbeResponse> {
    return from(this.api.invoke(probeYahooAccess, { gameKey, season, leagueKey, target }));
  }

  /** The service account's own leagues — where a league key for the probe comes from. */
  yahooLeagues(): Observable<LeaguesResponse> {
    return from(this.api.invoke(yahooServiceAccountLeagues));
  }

  /** Everyone with Premium right now, paying and given alike. */
  premiumCustomers(): Observable<AdminPremiumCustomerResponse[]> {
    return from(this.api.invoke(premiumCustomers));
  }

  grantPremium(body: AdminGrantPremiumRequest): Observable<AdminPremiumGrantResponse> {
    return from(this.api.invoke(grantPremium, { body }));
  }

  revokePremiumGrants(userId: string): Observable<void> {
    return from(this.api.invoke(revokePremiumGrants, { userId }));
  }
}
