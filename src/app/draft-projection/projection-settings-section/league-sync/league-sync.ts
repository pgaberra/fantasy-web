import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { YahooLeagueSyncComponent, YahooSyncResult } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent, EspnSyncResult } from '../espn-league-sync/espn-league-sync';
import { Platform, PlatformTabsComponent } from '../../../shared/platform-tabs/platform-tabs';

type Provider = Platform | 'none';

interface LinkedElsewhere {
  platform: 'Yahoo' | 'ESPN';
  leagueName: string | null;
  /** Article and platform of a sync on the open tab, which would take the link over. */
  replacedBy: string;
}

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
 * user presses Disconnect, which drops the link (`disconnected`) and leaves the values where they
 * are, now the user's. Importing again is how the link comes back. The button sits on whichever
 * line names the link — the platform's own synced line, the other tab's note about it, or, with no
 * platform on offer, a line of its own — so the link is stated once, with the way out beside it.
 */
@Component({
  selector: 'app-league-sync',
  imports: [YahooLeagueSyncComponent, EspnLeagueSyncComponent, PlatformTabsComponent],
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
   * The platform whose league the settings are held to, if any. Yahoo wins when both are set, as it
   * does in the draft's own reading of the link. The ESPN stamp, not the remembered id, says an
   * ESPN league is linked: the id outlives a disconnect so the next import can start from it.
   */
  protected readonly linkedPlatform = computed<Platform | null>(() => {
    if (this.lastSync()) {
      return 'yahoo';
    }
    return this.lastEspnSyncedAt() ? 'espn' : null;
  });

  /** The league the settings are held to, if any. */
  readonly linkedLeagueName = computed<string | null>(() => {
    switch (this.linkedPlatform()) {
      case 'yahoo':
        return this.lastSync()?.leagueName ?? null;
      case 'espn':
        return this.lastEspnLeagueName() ?? this.lastEspnLeagueId();
      default:
        return null;
    }
  });

  protected readonly yahooAvailable = !environment.yahooSyncDisabled;
  protected readonly espnAvailable = environment.espnLeaguesEnabled;
  protected readonly anyAvailable = this.yahooAvailable || this.espnAvailable;
  protected readonly platforms: Platform[] = [
    ...(this.yahooAvailable ? ['yahoo' as const] : []),
    ...(this.espnAvailable ? ['espn' as const] : []),
  ];
  protected readonly hint = this.buildHint();

  // Already synced from somewhere? Open on that platform, so its status stays shown and
  // re-syncing is one click — unless that platform's sync is currently off. Otherwise the tabs
  // only mean something when there are two of them: with a single platform on offer the picker
  // is a one-button choice, so make it, and the user lands straight on the form instead of
  // having to click a tab that had no alternative.
  readonly provider = linkedSignal<Provider>(() => this.initialProvider());

  /**
   * The league the settings are synced with, while the open tab is the other platform. A tab is
   * only where an import would come from: looking at it unlinks nothing, and the link changes only
   * when a league is actually synced. Without this line the tab's own form reads as if nothing
   * were synced at all.
   */
  protected readonly linkedElsewhere = computed<LinkedElsewhere | null>(() => {
    const yahoo = this.lastSync();
    if (this.provider() === 'espn' && yahoo) {
      return { platform: 'Yahoo', leagueName: yahoo.leagueName, replacedBy: 'an ESPN' };
    }
    // Yahoo wins when both are set, as it does in the draft's own reading of the link.
    if (this.provider() === 'yahoo' && !yahoo && this.lastEspnSyncedAt()) {
      return { platform: 'ESPN', leagueName: this.lastEspnLeagueName(), replacedBy: 'a Yahoo' };
    }
    return null;
  });

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
