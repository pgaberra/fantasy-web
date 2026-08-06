import { Component, input, output, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';
import { YahooLeagueSyncComponent, YahooSyncResult } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent } from '../espn-league-sync/espn-league-sync';

type Provider = 'yahoo' | 'espn';

/**
 * Wraps the per-provider league-sync UIs behind a provider picker. When ESPN is disabled (the
 * default, via {@link environment.espnLeaguesEnabled}) it renders the Yahoo sync alone, so
 * nothing changes for existing users.
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
  readonly provider = signal<Provider>('yahoo');
}
