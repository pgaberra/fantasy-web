import { Component, input, linkedSignal, output } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';
import { YahooLeagueSyncComponent, YahooSyncResult } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent } from '../espn-league-sync/espn-league-sync';

type Provider = 'none' | 'yahoo' | 'espn';

/**
 * Wraps the per-provider league-sync UIs behind an optional platform picker. Syncing is a
 * convenience for the two supported platforms (Yahoo, ESPN) — on any other platform (e.g.
 * Fantrax) the user just sets the league settings manually, so no platform is pre-selected.
 * When ESPN is disabled (the default) it renders the Yahoo sync alone, unchanged.
 */
@Component({
  selector: 'app-league-sync',
  imports: [YahooLeagueSyncComponent, EspnLeagueSyncComponent],
  templateUrl: './league-sync.html',
  styleUrl: './league-sync.css',
})
export class LeagueSyncComponent {
  readonly lastSync = input<YahooSync | null>(null);
  readonly yahooSynced = output<YahooSyncResult>();
  readonly espnSynced = output<LeagueProjectionSettingsResponse>();

  protected readonly espnEnabled = environment.espnLeaguesEnabled;
  // Nothing is pre-selected on a fresh projection — the user opts into a platform only if they
  // have one. A projection already synced from Yahoo defaults to Yahoo so its status stays shown.
  readonly provider = linkedSignal<Provider>(() => (this.lastSync() ? 'yahoo' : 'none'));
}
