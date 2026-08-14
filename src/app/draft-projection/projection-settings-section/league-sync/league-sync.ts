import { Component, input, linkedSignal, output } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { YahooLeagueSyncComponent, YahooSyncResult } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent, EspnSyncResult } from '../espn-league-sync/espn-league-sync';

type Provider = 'none' | 'yahoo' | 'espn';

/**
 * Wraps the per-provider league-sync UIs behind an optional platform picker. Syncing is a
 * convenience for the supported platforms — on any other platform (e.g. Fantrax) the user just
 * sets the league settings manually, so with a choice to make no platform is pre-selected.
 *
 * A platform whose sync is turned off (Yahoo between NHL seasons, ESPN before it's enabled) has
 * its tab hidden rather than shown disabled, and the hint names only what's actually on offer.
 * With neither available the whole section disappears.
 */
@Component({
  selector: 'app-league-sync',
  imports: [YahooLeagueSyncComponent, EspnLeagueSyncComponent],
  templateUrl: './league-sync.html',
  styleUrl: './league-sync.css',
})
export class LeagueSyncComponent {
  readonly lastSync = input<YahooSync | null>(null);
  /** The ESPN league this projection last synced from, for the ESPN panel to start from. */
  readonly lastEspnLeagueId = input<string | null>(null);
  readonly lastEspnSyncedAt = input<string | null>(null);
  readonly yahooSynced = output<YahooSyncResult>();
  readonly espnSynced = output<EspnSyncResult>();

  protected readonly yahooAvailable = !environment.yahooSyncDisabled;
  protected readonly espnAvailable = environment.espnLeaguesEnabled;
  protected readonly anyAvailable = this.yahooAvailable || this.espnAvailable;
  protected readonly hint = this.buildHint();

  // A projection already synced from Yahoo defaults to Yahoo so its status stays shown, unless
  // Yahoo's sync is currently off. Otherwise the tabs only mean something when there are two of
  // them: with a single platform on offer the picker is a one-button choice, so make it, and the
  // user lands straight on the form instead of having to click a tab that had no alternative.
  readonly provider = linkedSignal<Provider>(() => this.initialProvider());

  private initialProvider(): Provider {
    if (this.lastSync() && this.yahooAvailable) {
      return 'yahoo';
    }
    if (this.yahooAvailable && this.espnAvailable) {
      return 'none';
    }
    if (this.yahooAvailable) {
      return 'yahoo';
    }
    return this.espnAvailable ? 'espn' : 'none';
  }

  private buildHint(): string {
    if (this.yahooAvailable && this.espnAvailable) {
      return 'On Yahoo or ESPN? Choose your platform to auto-fill scoring and roster settings from your league.';
    }
    const platform = this.yahooAvailable ? 'Yahoo' : 'ESPN';
    return `On ${platform}? Auto-fill scoring and roster settings from your league.`;
  }
}
