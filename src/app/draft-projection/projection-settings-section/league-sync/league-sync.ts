import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { YahooLeagueSyncComponent, YahooSyncResult } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent, EspnSyncResult } from '../espn-league-sync/espn-league-sync';
import { YahooMarkComponent } from '../../../shared/yahoo-mark/yahoo-mark';
import { IconComponent } from '../../../shared/icon/icon';

type Provider = 'none' | 'yahoo' | 'espn';

/**
 * Wraps the per-provider league-sync UIs behind an optional platform picker. Syncing is a
 * convenience for the supported platforms — on any other platform (e.g. Fantrax) the user just
 * sets the league settings manually, so with a choice to make no platform is pre-selected.
 *
 * A platform whose sync is turned off (Yahoo between NHL seasons, ESPN before it's enabled) has
 * its tab hidden rather than shown disabled, and the hint names only what's actually on offer.
 * With neither available the whole section disappears.
 *
 * A league once imported owns the settings it set: every page holds them as they came until the
 * user presses Disconnect league here, which drops the link (`disconnected`) and leaves the values
 * where they are, now the user's. Importing again is how the link comes back.
 */
@Component({
  selector: 'app-league-sync',
  imports: [YahooLeagueSyncComponent, EspnLeagueSyncComponent, YahooMarkComponent, IconComponent],
  templateUrl: './league-sync.html',
  styleUrl: './league-sync.css',
})
export class LeagueSyncComponent {
  readonly lastSync = input<YahooSync | null>(null);
  /** The ESPN league this projection last synced from, for the ESPN panel to start from. */
  readonly lastEspnLeagueId = input<string | null>(null);
  readonly lastEspnSyncedAt = input<string | null>(null);
  readonly lastEspnLeagueName = input<string | null>(null);
  /**
   * Open on Yahoo whatever else would decide: the dialog is back from a Yahoo connect it started,
   * and the leagues that connect was for are what the user came back to pick from.
   */
  readonly openOnYahoo = input(false);
  readonly yahooSynced = output<YahooSyncResult>();
  readonly espnSynced = output<EspnSyncResult>();
  /** The user let go of the league: the settings stay as they are and become theirs to change. */
  readonly disconnected = output<void>();

  /**
   * The league the settings are held to, if any. The ESPN stamp, not the remembered id, says an
   * ESPN league is linked: the id outlives a disconnect so the next import can start from it.
   */
  readonly linkedLeagueName = computed<string | null>(() => {
    const yahoo = this.lastSync();
    if (yahoo) {
      return yahoo.leagueName;
    }
    return this.lastEspnSyncedAt() ? (this.lastEspnLeagueName() ?? this.lastEspnLeagueId()) : null;
  });

  protected readonly yahooAvailable = !environment.yahooSyncDisabled;
  protected readonly espnAvailable = environment.espnLeaguesEnabled;
  protected readonly anyAvailable = this.yahooAvailable || this.espnAvailable;
  protected readonly hint = this.buildHint();

  // Already synced from somewhere? Open on that platform, so its status stays shown and
  // re-syncing is one click — unless that platform's sync is currently off. Otherwise the tabs
  // only mean something when there are two of them: with a single platform on offer the picker
  // is a one-button choice, so make it, and the user lands straight on the form instead of
  // having to click a tab that had no alternative.
  readonly provider = linkedSignal<Provider>(() => this.initialProvider());

  private initialProvider(): Provider {
    if ((this.openOnYahoo() || this.lastSync()) && this.yahooAvailable) {
      return 'yahoo';
    }
    // The stamp of the last ESPN sync, not the remembered league id: the id outlives an unsync
    // and would keep re-opening on ESPN long after the settings stopped being ESPN's.
    if (this.lastEspnSyncedAt() && this.espnAvailable) {
      return 'espn';
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
      return "Choose Yahoo or ESPN to import your league's scoring and roster settings.";
    }
    const platform = this.yahooAvailable ? 'Yahoo' : 'ESPN';
    return `On ${platform}? Import your league's scoring and roster settings.`;
  }
}
