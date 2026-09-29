import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { YahooLeagueSyncComponent, YahooSyncResult } from '../yahoo-league-sync/yahoo-league-sync';
import { EspnLeagueSyncComponent, EspnSyncResult } from '../espn-league-sync/espn-league-sync';
import { Platform, PlatformTabsComponent } from '../../../shared/platform-tabs/platform-tabs';
import {
  PlatformName,
  PlatformSwitchDialogComponent,
} from './platform-switch-dialog/platform-switch-dialog';

type Provider = Platform | 'none';

/**
 * Why the league was let go of: a Disconnect button, which is all the user came for, or a
 * confirmed move to the other platform's tab, where they are about to sync another league.
 */
export type DisconnectCause = 'button' | 'platform-switch';

interface PendingSwitch {
  target: Platform;
  targetPlatform: PlatformName;
  linkedPlatform: PlatformName;
  leagueName: string;
}

const PLATFORM_NAMES: Record<Platform, PlatformName> = { yahoo: 'Yahoo', espn: 'ESPN' };

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
 * line names the link — the platform's own synced line or, with that platform's tab not on offer,
 * a line of its own — so the link is stated once, with the way out beside it. Opening the other
 * platform's tab while linked asks first, and going on disconnects the league the same way.
 */
@Component({
  selector: 'app-league-sync',
  imports: [
    YahooLeagueSyncComponent,
    EspnLeagueSyncComponent,
    PlatformTabsComponent,
    PlatformSwitchDialogComponent,
  ],
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
  readonly disconnected = output<DisconnectCause>();

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
  // Letting go of a league moves no tab, though: the user stays where they are, which after a
  // confirmed switch is the platform they switched to.
  readonly provider = linkedSignal<{ linked: Platform | null; openOnYahoo: boolean }, Provider>({
    source: () => ({ linked: this.linkedPlatform(), openOnYahoo: this.openOnYahoo() }),
    computation: (source, previous) =>
      previous?.source.linked && !source.linked
        ? previous.value
        : this.initialProvider(source.linked, source.openOnYahoo),
  });

  /**
   * The linked league, while its platform has no tab here (Yahoo between seasons): no panel
   * names it then, so a line of its own does, with the way out beside it.
   */
  protected readonly linkedOffTab = computed<string | null>(() => {
    const linked = this.linkedPlatform();
    return linked && !this.platforms.includes(linked) ? this.linkedLeagueName() : null;
  });

  /** The other platform's tab, clicked while a league is synced: the question is open. */
  protected readonly pendingTarget = signal<Platform | null>(null);

  protected readonly pendingSwitch = computed<PendingSwitch | null>(() => {
    const target = this.pendingTarget();
    const linked = this.linkedPlatform();
    const leagueName = this.linkedLeagueName();
    if (!target || !linked || !leagueName) {
      return null;
    }
    return {
      target,
      targetPlatform: PLATFORM_NAMES[target],
      linkedPlatform: PLATFORM_NAMES[linked],
      leagueName,
    };
  });

  /**
   * A tab clicked. The settings follow one league at a time, so the other platform's tab is where
   * the synced one would be replaced: ask first rather than let the league go quietly.
   */
  protected choose(target: Platform): void {
    const linked = this.linkedPlatform();
    if (linked && target !== linked && target !== this.provider()) {
      this.pendingTarget.set(target);
      return;
    }
    this.provider.set(target);
  }

  protected switchAndDisconnect(target: Platform): void {
    this.pendingTarget.set(null);
    this.provider.set(target);
    this.disconnected.emit('platform-switch');
  }

  private initialProvider(linked: Platform | null, openOnYahoo: boolean): Provider {
    if ((openOnYahoo || linked === 'yahoo') && this.yahooAvailable) {
      return 'yahoo';
    }
    if (linked === 'espn' && this.espnAvailable) {
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
