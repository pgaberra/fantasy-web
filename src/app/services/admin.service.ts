import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { connectYahooServiceAccount } from '../api/fn/admin/connect-yahoo-service-account';
import { yahooServiceConnection } from '../api/fn/admin/yahoo-service-connection';
import { triggerPlayerSync } from '../api/fn/admin/trigger-player-sync';
import { playerSyncRuns } from '../api/fn/admin/player-sync-runs';
import {
  AuthorizeUrlResponse,
  ConnectionResponse,
  SyncAcceptedResponse,
  SyncRunResponse,
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
}
